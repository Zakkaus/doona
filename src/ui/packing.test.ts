import {describe, expect, it} from 'vitest';
import {controlLayout, fills, type Box} from './packing';

const box = (left: number, right: number, top: number, bottom: number): Box => ({left, right, top, bottom});

describe('fills', () => {
  it.each([
    ['one row ends level with its tallest card', [box(0, 100, 0, 80), box(112, 212, 0, 120)], [40, 0]],
    ['a short card stacked beside a tall one grows to its end', [box(0, 100, 0, 300), box(112, 212, 0, 100), box(112, 212, 112, 200)], [0, 0, 100]],
    ['a card above a full-row card stops at the gap above it', [box(0, 100, 0, 300), box(112, 212, 0, 100), box(0, 212, 312, 400)], [0, 200, 0]],
    ['touching edges do not count as one column', [box(0, 100, 0, 50), box(100.5, 200, 62, 100)], [50, 0]],
    // Control cards in one row: mode, a read-only global card with its extra line, a missing group, an error.
    [
      'control cards in a row share the tallest height',
      [box(0, 100, 0, 66), box(112, 212, 0, 90), box(224, 324, 0, 70), box(336, 436, 0, 112)],
      [46, 22, 42, 0]
    ],
    ['a control row above a chart row ends level above it', [box(0, 100, 0, 66), box(112, 212, 0, 90), box(0, 212, 102, 300)], [24, 0, 0]],
    ['an empty section has nothing to fill', [], []]
  ])('%s', (_, boxes, expected) => {
    expect(fills(boxes, 12)).toEqual(expected);
  });
});

describe('controlLayout', () => {
  it.each([
    [
      'every card fits on one line',
      [
        {natural: 300, width: 320},
        {natural: 200, width: 200}
      ],
      'inline'
    ],
    [
      'one card that does not fit stacks them all',
      [
        {natural: 300, width: 320},
        {natural: 330, width: 320}
      ],
      'stacked'
    ]
  ] as const)('%s', (_, rows, expected) => {
    expect(controlLayout(rows)).toBe(expected);
  });
});
