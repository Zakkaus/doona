// Prints the test groups Playwright cuts into shards, in its order, as JSON: [[{project, file, title}, ...], ...].
//
// Playwright shards whole groups, not single tests: tests that share a worker hash (the worker-scoped option overrides of a file) come together,
// a serial group stays whole, and the tests under a beforeAll or afterAll hook are chunked by shard count. This mirrors createTestGroups of
// @playwright/test 1.63.0 so tools/e2e-shards.mjs can place the shard borders on group borders; tools/e2e-shards.test.mjs checks the result
// against what Playwright really puts in each shard. The shard count comes from DOONA_SHARD_TOTAL.
function createTestGroups(projectSuite, expectedParallelism) {
  const byHash = new Map();
  const create = test => ({workerHash: test._workerHash, tests: []});
  for (const test of projectSuite.allTests()) {
    let byFile = byHash.get(test._workerHash);
    if (!byFile) byHash.set(test._workerHash, (byFile = new Map()));
    let entry = byFile.get(test._requireFile);
    if (!entry) byFile.set(test._requireFile, (entry = {general: create(test), parallel: new Map(), withHooks: create(test)}));
    let insideParallel = false;
    let sequential;
    let hasAllHooks = false;
    for (let parent = test.parent; parent; parent = parent.parent) {
      if (parent._parallelMode === 'serial' || parent._parallelMode === 'default') sequential = parent;
      insideParallel ||= parent._parallelMode === 'parallel';
      hasAllHooks ||= parent._hooks.some(hook => hook.type === 'beforeAll' || hook.type === 'afterAll');
    }
    if (!insideParallel) {
      entry.general.tests.push(test);
    } else if (hasAllHooks && !sequential) {
      entry.withHooks.tests.push(test);
    } else {
      const key = sequential || test;
      if (!entry.parallel.has(key)) entry.parallel.set(key, create(test));
      entry.parallel.get(key).tests.push(test);
    }
  }
  const groups = [];
  for (const byFile of byHash.values()) {
    for (const entry of byFile.values()) {
      if (entry.general.tests.length) groups.push(entry.general);
      groups.push(...entry.parallel.values());
      const size = Math.ceil(entry.withHooks.tests.length / expectedParallelism);
      let last;
      for (const test of entry.withHooks.tests) {
        if (!last || last.tests.length >= size) groups.push((last = create(test)));
        last.tests.push(test);
      }
    }
  }
  return groups;
}

export default class GroupsReporter {
  onBegin(config, rootSuite) {
    const total = Number(process.env.DOONA_SHARD_TOTAL);
    const groups = rootSuite.suites.flatMap(projectSuite => createTestGroups(projectSuite, total));
    const place = test => {
      const [, project, file, ...title] = test.titlePath();
      return {project, file, title: title.join(' › ')};
    };
    process.stdout.write(`${JSON.stringify(groups.map(group => group.tests.map(place)))}\n`);
  }
}
