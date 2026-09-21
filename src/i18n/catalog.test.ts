import {expect, it} from 'vitest';
import {duplicateKeys} from './catalog';

it('never overwrites a message from another module during merging', () => {
  expect(duplicateKeys()).toEqual([]);
});
