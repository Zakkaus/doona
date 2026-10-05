import {test} from '@playwright/test';

test.use({launchOptions: {args: ['--fixture']}});

for (const name of ['d1', 'd2']) test(name, () => {});
