import {test} from '@playwright/test';

for (const name of ['a1', 'a2', 'a3']) test(name, () => {});
