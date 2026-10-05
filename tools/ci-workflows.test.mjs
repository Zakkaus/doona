import {execFileSync} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, it} from 'vitest';
import {parse} from 'yaml';

const load = name => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
const release = load('release');
const check = load('check');
const uses = (job, name) => job.steps.find(step => step.uses?.startsWith(`${name}@`));

it('keeps the release write token away from dependency and build steps', () => {
  expect(release.permissions).toEqual({});
  const writers = Object.entries(release.jobs).filter(([, job]) => job.permissions?.contents === 'write');
  expect(writers.map(([name]) => name)).toEqual(['release']);
  const {build, release: publish} = release.jobs;
  expect(build.permissions).toEqual({contents: 'read'});
  expect(publish.needs).toEqual(expect.arrayContaining(['build', 'nfpm', 'alpine', 'openwrt-apk', 'sums']));
  expect(publish.steps.some(step => step.run || step.uses?.startsWith('actions/checkout@'))).toBe(false);
  expect(uses(publish, 'actions/download-artifact').with.name).toBe(uses(release.jobs.sums, 'actions/upload-artifact').with.name);
});

it('publishes and waits for Check only on a tag push', () => {
  expect(release.on.push.tags).toEqual(['v*']);
  expect(release.on).toHaveProperty('workflow_dispatch');
  expect(release.jobs.verified.if).toBe("github.event_name == 'push'");
  expect(release.jobs.release.if).toBe("github.event_name == 'push'");
});

it('builds the release once, after the Check run on the tagged commit passed', () => {
  const commands = release.jobs.build.steps.map(step => step.run);
  expect(commands.filter(command => command === 'pnpm build')).toHaveLength(1);
  expect(commands.some(command => /playwright|pnpm e2e/.test(command ?? ''))).toBe(false);
  expect(release.jobs.build.needs).toContain('verified');
  expect(release.jobs.verified.permissions).toEqual({actions: 'read'});
  expect(release.jobs.verified.steps.map(step => step.run ?? '').join('\n')).toMatch(/check\.yml/);
});

it.each(['VERSION', 'PRERELEASE', 'ARCH_PRERELEASE', 'NPM', 'PACKAGE_RELEASE'])('hands %s from the build job to the release job', key => {
  expect(release.jobs.build.outputs[key]).toBe(`\${{ steps.version.outputs.${key} }}`);
  expect(release.jobs.release.env[key]).toBe(`\${{ needs.build.outputs.${key} }}`);
});

it('runs every browser test in every shard', () => {
  const shard = check.jobs.e2e.steps.find(step => step.name === 'Run the browser shard');
  expect(shard.run).not.toMatch(/grep/);
  expect(shard.run).toMatch(/if weights=\$\(node tools\/e2e-shards\.mjs weights "\$\{\{ strategy\.job-total \}\}"\); then/);
  expect(shard.run).toMatch(/export PWTEST_SHARD_WEIGHTS="\$weights"/);
  expect(check.jobs.changes.outputs).toEqual({lane: '${{ steps.route.outputs.lane }}'});
});

// Runs the shard step in a scratch directory whose tools/e2e-shards.mjs is `weights` (or missing), with a pnpm that reports what the run would see.
function runShardStep(weights) {
  const step = check.jobs.e2e.steps.find(step => step.name === 'Run the browser shard').run;
  const dir = mkdtempSync(join(tmpdir(), 'shard-step-'));
  try {
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin', 'pnpm'), '#!/bin/sh\necho "ran $* with weights ${PWTEST_SHARD_WEIGHTS-unset}"\n');
    chmodSync(join(dir, 'bin', 'pnpm'), 0o755);
    if (weights !== undefined) {
      mkdirSync(join(dir, 'tools'));
      writeFileSync(join(dir, 'tools', 'e2e-shards.mjs'), weights);
    }
    const script = step.replaceAll('${{ strategy.job-total }}', '9').replaceAll('${{ matrix.shard }}', '3');
    return execFileSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: dir,
      encoding: 'utf8',
      env: {...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`},
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } finally {
    rmSync(dir, {recursive: true});
  }
}

it('runs the shard with the computed weights', () => {
  expect(runShardStep("console.log('1:2:3:4:5:6:7:8:9');")).toBe('ran e2e --shard=3/9 --reporter=list,github,blob,json with weights 1:2:3:4:5:6:7:8:9\n');
});

it.each([
  ['a script that throws', "throw new Error('internals changed');"],
  ['a missing script', undefined]
])('fails open to the default split with a warning for %s', (_, weights) => {
  const out = runShardStep(weights);
  expect(out).toMatch(/^::warning::Could not balance the e2e shards by test time/);
  expect(out).toMatch(/ran e2e --shard=3\/9 --reporter=list,github,blob,json with weights unset\n$/);
});
