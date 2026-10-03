import {readFileSync} from 'node:fs';
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
  expect(publish.needs).toContain('build');
  expect(publish.steps.some(step => step.run || step.uses?.startsWith('actions/checkout@'))).toBe(false);
  expect(uses(publish, 'actions/download-artifact').with.name).toBe(uses(build, 'actions/upload-artifact').with.name);
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
  expect(check.jobs.changes.outputs).toEqual({lane: '${{ steps.route.outputs.lane }}'});
});
