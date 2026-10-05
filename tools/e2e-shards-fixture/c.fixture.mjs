import {test} from '@playwright/test';

test.beforeAll(() => {});

for (const name of ['c1', 'c2', 'c3', 'c4']) test(name, () => {});
