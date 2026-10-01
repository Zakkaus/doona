import {expect, it} from 'vitest';
import {reorderKeys} from './SortableCanvas';
it('moves stable keys together and cancels a drop onto the dragged item', () => {
  const ids = ['a', 'b', 'c', 'd'];
  expect(reorderKeys(ids, new Set(['a', 'c']), 'd', 'after')).toEqual(['b', 'd', 'a', 'c']);
  expect(reorderKeys(ids, new Set(['a']), 'a', 'before')).toBe(ids);
});
