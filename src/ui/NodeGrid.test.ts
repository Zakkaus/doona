import {expect, it} from 'vitest';
import {nodeGridSize} from './NodeGrid';

it('reserves the same gap at both edges of a single column', () => {
  expect(nodeGridSize(324, 8)).toEqual({columns: 1, width: 308});
});

it('fits complete tiles and both outer gaps before adding a column', () => {
  expect(nodeGridSize(1187, 8).columns).toBe(4);
  expect(nodeGridSize(1188, 8)).toEqual({columns: 5, width: 228});
  const size = nodeGridSize(1190, 8);
  expect(size.columns * size.width + (size.columns + 1) * 8).toBe(1190);
});
