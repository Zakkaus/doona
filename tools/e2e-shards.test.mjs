import {execFileSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {listGroups, recordDurations, shardWeights} from './e2e-shards.mjs';

const test = (projectName, ...seconds) => ({projectName, results: seconds.map(duration => ({duration: duration * 1000}))});
const report = suites => ({config: {projects: [{name: 'chromium'}, {name: 'webkit'}]}, suites});
const file = (name, ...specs) => ({
  title: name,
  specs: [],
  suites: [{title: 'group', suites: [], specs: specs.map(([title, ...tests]) => ({title, file: name, tests}))}]
});

it('records the seconds and tests per file, summing retries and reports', () => {
  const one = report([file('a.spec.ts', ['x', test('chromium', 1, 2)], ['y', test('chromium', 4)], ['z', test('webkit', 4)])]);
  const two = report([file('a.spec.ts', ['x', test('chromium', 5)])]);
  expect(recordDurations([one, two])).toEqual({'chromium|a.spec.ts': [12, 3], 'webkit|a.spec.ts': [4, 1]});
});

const tests = (file, count, project = 'chromium') => Array.from({length: count}, (_, index) => ({project, file, title: `t${index}`}));
const single = list => list.map(entry => [entry]);

it('cuts the slices by recorded time, not by test count', () => {
  const list = [...tests('slow.spec.ts', 4), ...tests('fast.spec.ts', 12)];
  // Twelve fast tests at 1 s match the 12 s of the four slow ones.
  expect(shardWeights(single(list), {'chromium|slow.spec.ts': [12, 4], 'chromium|fast.spec.ts': [4, 4]}, 2)).toBe('4:12');
});

it('prices unrecorded files by chromium, then by project, and gives every shard a group', () => {
  const durations = {'chromium|known.spec.ts': [8, 4], 'chromium|other.spec.ts': [2, 2]};
  const list = single([...tests('known.spec.ts', 2), ...tests('known.spec.ts', 2, 'webkit'), ...tests('new.spec.ts', 2)]);
  expect(shardWeights(list, durations, 6)).toBe('1:1:1:1:1:1');
  expect(shardWeights(list.slice(0, 3), durations, 3)).toBe('1:1:1');
  // The webkit tests borrow known.spec.ts's 2 s from chromium and new.spec.ts takes the chromium mean, so the cost is even enough for 3:3.
  expect(shardWeights(list, durations, 2)).toBe('3:3');
});

it('balances a skewed list so that no slice exceeds the best cap', () => {
  const list = single([...tests('slow.spec.ts', 10), ...tests('fast.spec.ts', 90)]);
  // 190 s over four shards: five slow tests (50 s) fill each of the first two, and the best cap is 50 s.
  expect(shardWeights(list, {'chromium|slow.spec.ts': [100, 10], 'chromium|fast.spec.ts': [90, 90]}, 4)).toBe('5:5:50:40');
});

it('keeps a group whole and counts its tests in the weights', () => {
  const list = [[...tests('a.spec.ts', 3)], ...single(tests('b.spec.ts', 3))];
  expect(shardWeights(list, {'chromium|a.spec.ts': [3, 3], 'chromium|b.spec.ts': [3, 3]}, 2)).toBe('3:3');
});

const fixture = fileURLToPath(new URL('./e2e-shards-fixture/playwright.config.mjs', import.meta.url));
const title = entry => `${entry.project}:${entry.title}`;

// Playwright's sharding is internal: PWTEST_SHARD_WEIGHTS sizes the slices and whole groups of tests are dealt out. If an upgrade stops honouring
// the variable or regroups the tests, the shards would silently go back to uneven or mismatched slices.
describe('fixture sharding', () => {
  let groups;

  beforeAll(() => {
    groups = listGroups(2, ['-c', fixture]);
  });

  const shardTitles = (current, weights) => {
    const env = {...process.env, PWTEST_SHARD_WEIGHTS: weights};
    if (!weights) delete env.PWTEST_SHARD_WEIGHTS;
    const listed = execFileSync('pnpm', ['exec', 'playwright', 'test', '-c', fixture, '--list', '--reporter=json', `--shard=${current}/2`], {
      encoding: 'utf8',
      env
    });
    const titles = [];
    const visit = suite => {
      for (const spec of suite.specs) for (const test of spec.tests) titles.push(`${test.projectName}:${spec.title}`);
      suite.suites?.forEach(visit);
    };
    JSON.parse(listed).suites.forEach(visit);
    return titles.sort();
  };
  const slice = (from, to) => groups.slice(from, to).flat().map(title).sort();

  it('keeps the fixture group order and worker hashes', () => {
    const project = [1, 1, 1, 1, 1, 1, 2, 2, 1, 1];
    // Each project lists a1-a3 and b1-b3, the two chunks of the hooked c1-c4, then d1 and d2 with the other worker hash.
    expect(groups.map(group => group.length)).toEqual([...project, ...project]);
    expect(groups[6].map(title)).toEqual(['one:c1', 'one:c2']);
    expect(groups[8].map(title)).toEqual(['one:d1']);
  });

  // The border at 7 tests falls inside the chunk c1-c2, which starts at the sixth test and so goes whole to the first shard.
  it.each([
    ['unweighted first', 1, undefined, 0, 10],
    ['weighted first', 1, '7:17', 0, 7],
    ['weighted second', 2, '7:17', 7, 20]
  ])('puts the %s shard in the predicted group slice', (label, current, weights, from, to) => {
    expect(shardTitles(current, weights)).toEqual(slice(from, to));
  });
});

it('lists the groups although the workflow sets the JSON reporter variables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-shards-'));
  const env = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: join(dir, 'report.json'),
    PLAYWRIGHT_JSON_OUTPUT_DIR: dir,
    PLAYWRIGHT_JSON_OUTPUT_NAME: 'report.json'
  };
  try {
    const weights = execFileSync('node', [fileURLToPath(new URL('./e2e-shards.mjs', import.meta.url)), 'weights', '2', '-c', fixture], {encoding: 'utf8', env});
    expect(weights).toMatch(/^\d+:\d+\n$/);
    expect(readdirSync(dir)).toEqual([]);
  } finally {
    rmSync(dir, {recursive: true});
  }
});
