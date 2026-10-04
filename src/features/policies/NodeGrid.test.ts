import {expect, it} from 'vitest';
import {nodeGridSize} from './NodeGrid';

it('reserves the same gap at both edges of a single column', () => {
  expect(nodeGridSize(324, 8, 125)).toEqual({columns: 1, width: 308, overflows: true});
});

it('fits complete tiles and both outer gaps before adding a column', () => {
  expect(nodeGridSize(1187, 8, 125).columns).toBe(4);
  expect(nodeGridSize(1188, 8, 125)).toMatchObject({columns: 5, width: 228});
  const size = nodeGridSize(1190, 8, 125);
  expect(size.columns * size.width + (size.columns + 1) * 8).toBe(1190);
});

// A filtered result keeps the empty columns, and the panel scrolls only once the rows run past its 376px.
it.each([
  [1070, 0, 4, 257.5, false],
  [1070, 1, 4, 257.5, false],
  [1070, 2, 4, 257.5, false],
  [1070, 12, 4, 257.5, false],
  [1070, 13, 4, 257.5, false],
  [1070, 125, 4, 257.5, true],
  [324, 2, 1, 308, false],
  [324, 5, 1, 308, false],
  [324, 6, 1, 308, true],
  [654, 13, 2, 315, true]
])('at %ipx, %i tiles take %i columns of %fpx; overflows: %s', (width, count, columns, tile, overflows) => {
  expect(nodeGridSize(width, 8, count)).toEqual({columns, width: tile, overflows});
});
