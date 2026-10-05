// Balances the Playwright shards by recorded test time instead of test count.
//
// Playwright cuts the ordered test list into contiguous slices of equal test count, so a shard that holds the slow dashboard and mobile tests
// runs much longer than the others. PWTEST_SHARD_WEIGHTS sets the slice size per shard; this script derives those sizes from the per-file test
// time of each file in tools/e2e-durations.json so every slice costs about the same. New files fall back to the project mean and deleted files
// drop out, so the split follows the suite without a hand-kept list. `record` refreshes the durations from JSON reports.
//
// PWTEST_SHARD_WEIGHTS is an internal Playwright variable and shards are whole test groups; both were checked against @playwright/test 1.63.0
// (runner `filterForShard` and `createTestGroups`, mirrored in tools/e2e-groups-reporter.mjs). tools/e2e-shards.test.mjs runs a fixture project
// with them, so an upgrade that drops the variable or regroups the tests fails there instead of silently unbalancing the shards.
//
//   PWTEST_SHARD_WEIGHTS=$(node tools/e2e-shards.mjs weights 9) playwright test --shard=3/9
//   node tools/e2e-shards.mjs record e2e-1.json e2e-2.json ...
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

const durationsFile = new URL('./e2e-durations.json', import.meta.url);

// Calls visit(spec, "describe › … › test title") for every spec under a file suite.
const walk = (suite, visit, path = []) => {
  const here = [...path, suite.title];
  for (const spec of suite.specs ?? []) visit(spec, [...here, spec.title].slice(1).join(' › '));
  for (const child of suite.suites ?? []) walk(child, visit, here);
};

// Total seconds and test count for each "project|file", summed over every report given.
export function recordDurations(reports) {
  const sums = {};
  for (const report of reports) {
    for (const suite of report.suites) {
      walk(suite, spec => {
        for (const test of spec.tests) {
          const sum = (sums[`${test.projectName}|${spec.file}`] ??= [0, 0]);
          sum[0] += test.results.reduce((total, result) => total + result.duration, 0) / 1000;
          sum[1]++;
        }
      });
    }
  }
  return Object.fromEntries(
    Object.keys(sums)
      .sort()
      .map(key => [key, [Math.round(sums[key][0] * 10) / 10, sums[key][1]]])
  );
}

// The test groups of `playwright test --list` in the order Playwright shards them, for a run cut into `shards` shards.
export function listGroups(shards, playwrightArgs = []) {
  const reporter = fileURLToPath(new URL('./e2e-groups-reporter.mjs', import.meta.url));
  const listed = execFileSync('pnpm', ['exec', 'playwright', 'test', '--list', `--reporter=${reporter}`, ...playwrightArgs], {
    encoding: 'utf8',
    env: {...process.env, DOONA_SHARD_TOTAL: String(shards)},
    maxBuffer: 1 << 28
  });
  return JSON.parse(listed);
}

// Test counts per shard that make each contiguous slice of groups cost about the same, as the colon-separated PWTEST_SHARD_WEIGHTS value.
export function shardWeights(groups, durations, shards) {
  // A test costs its file's mean; an unrecorded file costs the same file's mean on chromium, then its project's mean, then the overall mean.
  const total = (match = () => true) => {
    const sum = [0, 0];
    for (const [key, [seconds, count]] of Object.entries(durations)) {
      if (!match(key)) continue;
      sum[0] += seconds;
      sum[1] += count;
    }
    return sum[1] ? sum[0] / sum[1] : undefined;
  };
  const cost = test =>
    total(key => key === `${test.project}|${test.file}`) ??
    total(key => key === `chromium|${test.file}`) ??
    total(key => key.startsWith(`${test.project}|`)) ??
    total() ??
    1;
  const costs = groups.map(group => group.reduce((sum, test) => sum + cost(test), 0));
  // The smallest cap that cuts the groups into at most `shards` slices, each keeping at least one group.
  const cut = cap => {
    const sizes = [];
    let size = 0;
    let sum = 0;
    costs.forEach((value, index) => {
      const left = costs.length - index;
      if (size && (sum + value > cap || left <= shards - sizes.length - 1)) {
        sizes.push(size);
        size = 0;
        sum = 0;
      }
      size++;
      sum += value;
    });
    sizes.push(size);
    return sizes;
  };
  let low = Math.max(...costs);
  let high = costs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 60; i++) {
    const middle = (low + high) / 2;
    if (cut(middle).length <= shards) high = middle;
    else low = middle;
  }
  const cuts = cut(high);
  while (cuts.length < shards) cuts.push(0);
  let at = 0;
  return cuts.map(count => groups.slice(at, (at += count)).reduce((sum, group) => sum + group.length, 0)).join(':');
}

function main([command, ...args]) {
  if (command === 'record') {
    const durations = recordDurations(args.map(file => JSON.parse(readFileSync(file, 'utf8'))));
    // One line per file, the way Prettier keeps it.
    const lines = Object.entries(durations).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value).replace(',', ', ')}`);
    writeFileSync(durationsFile, `{\n${lines.join(',\n')}\n}\n`);
  } else if (command === 'weights') {
    const [shards, ...playwrightArgs] = args;
    console.log(shardWeights(listGroups(Number(shards), playwrightArgs), JSON.parse(readFileSync(durationsFile, 'utf8')), Number(shards)));
  } else {
    console.error('usage: e2e-shards.mjs weights <shards> [playwright args] | record <json report>...');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
