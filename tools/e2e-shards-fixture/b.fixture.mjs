import {test} from '@playwright/test';

for (const name of ['b1', 'b2', 'b3']) test(name, () => {});
