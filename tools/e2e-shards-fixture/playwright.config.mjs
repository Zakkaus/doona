// A browserless project that tools/e2e-shards.test.mjs lists in two shards: two projects, a file whose tests sit under a beforeAll hook, and a
// file that overrides a worker option, which gives its tests another worker hash.
export default {testDir: '.', testMatch: '*.fixture.mjs', fullyParallel: true, projects: [{name: 'one'}, {name: 'two'}]};
