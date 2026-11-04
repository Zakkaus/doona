import {execFileSync} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, it} from 'vitest';
import {parse} from 'yaml';

const load = name => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
const release = load('release');
const check = load('check');
const sizeReport = load('report');
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
  expect(commands).toContain('pnpm -C apps/lite build');
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

it('publishes standalone assets before honk is available', () => {
  for (const name of ['build', 'sums', 'release']) expect(JSON.stringify(release.jobs[name])).not.toMatch(/honk|HONK-SOURCE/);
  const files = uses(release.jobs.release, 'softprops/action-gh-release').with.files;
  expect(files).toContain('release/SHA256SUMS');
  expect(files).toContain('release/*-${{ env.NPM }}.tar.gz');
  expect(release.jobs.sums.steps.some(step => step.run?.includes('sha256sum -- *'))).toBe(true);
});

it('keeps the size measurement of every Check run and shows it in the run summary', () => {
  expect(check.permissions).toEqual({contents: 'read'});
  expect(check.jobs.check.permissions).toEqual({actions: 'read', contents: 'read'});
  const steps = check.jobs.check.steps;
  const measure = steps.findIndex(step => step.run?.startsWith('pnpm check:size --json size-report.json'));
  const upload = steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@') && step.with.name === 'size-report');
  const summary = steps.findIndex(step => step.name === 'Show the size report');
  expect(measure).toBeGreaterThan(steps.findIndex(step => step.run === 'pnpm build'));
  expect(upload).toBeGreaterThan(measure);
  expect(summary).toBeGreaterThan(upload);
  // An over-limit build fails the measuring step, and that is when the numbers matter most.
  for (const index of [upload, summary]) expect(steps[index].if).toMatch(/!cancelled\(\)/);
  expect(steps[summary].run).toMatch(/>> "\$GITHUB_STEP_SUMMARY"/);
});

it('comments the size report from the default branch with a write token only in that job', () => {
  expect(sizeReport.on.workflow_run.workflows).toEqual(['Check']);
  expect(sizeReport.permissions).toEqual({});
  const {report} = sizeReport.jobs;
  expect(report.permissions).toEqual({actions: 'read', contents: 'read', 'pull-requests': 'write'});
  expect(report.if).toMatch(/workflow_run\.event == 'pull_request'/);
  expect(uses(report, 'actions/checkout').with).toEqual({ref: '${{ github.event.repository.default_branch }}', 'persist-credentials': false});
  const script = report.steps.map(step => step.run ?? '').join('\n');
  expect(script).not.toMatch(/pnpm|npm |npx|git checkout/);
  expect(script).toContain('<!-- size-report -->');
  // One group per pull request branch and no cancelling, so a second run waits for the first instead of both creating a comment.
  expect(sizeReport.concurrency).toEqual({
    group: 'size-report-${{ github.event.workflow_run.head_repository.full_name }}-${{ github.event.workflow_run.head_branch }}'
  });
  expect(script).toMatch(/size_in_bytes/);
  expect(script).not.toMatch(/head -n/);
  expect(script).toMatch(/-X PATCH "repos\/\$REPO\/issues\/comments\//);
});

it('pins every action in every workflow by commit', () => {
  expect(sizeReport.jobs.report.steps.filter(step => step.uses).length).toBeGreaterThan(0);
  for (const workflow of [check, release, sizeReport]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) if (step.uses) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  }
});
