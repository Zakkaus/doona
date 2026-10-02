import {describe, expect, it} from 'vitest';
import {controlLayout, fills, tileLayouts, type Box} from './packing';

const box = (left: number, right: number, top: number, bottom: number, band?: string): Box => ({left, right, top, bottom, band});

describe('fills', () => {
  it.each([
    ['one row ends level with its tallest card', [box(0, 100, 0, 80), box(112, 212, 0, 120)], [40, 0]],
    ['a short card stacked beside a tall one grows to its end', [box(0, 100, 0, 300), box(112, 212, 0, 100), box(112, 212, 112, 200)], [0, 0, 100]],
    ['a card above a full-row card stops at the gap above it', [box(0, 100, 0, 300), box(112, 212, 0, 100), box(0, 212, 312, 400)], [0, 200, 0]],
    ['touching edges do not count as one column', [box(0, 100, 0, 50), box(100.5, 200, 0, 100), box(0, 100, 62, 80)], [0, 0, 20]],
    // CPU and latency stacked on the left, upload beside CPU with nothing below it: upload matches CPU, not latency.
    ['a short card with nothing below it ends with its own row', [box(0, 300, 0, 110), box(312, 512, 0, 110), box(0, 300, 122, 232)], [0, 0, 0]],
    ['a taller row-mate stretches a short card even with space below', [box(0, 100, 0, 200), box(112, 212, 0, 110)], [0, 90]],
    // Control cards in one row: mode, a read-only global card with its extra line, a missing group, an error.
    [
      'control cards in a row share the tallest height',
      [box(0, 100, 0, 66), box(112, 212, 0, 90), box(224, 324, 0, 70), box(336, 436, 0, 112)],
      [46, 22, 42, 0]
    ],
    ['a control row above a chart row ends level above it', [box(0, 100, 0, 66), box(112, 212, 0, 90), box(0, 212, 102, 300)], [24, 0, 0]],
    // One card set tall: its row-mates of the standard step keep their heights and share theirs.
    [
      'a card of another height step neither stretches nor is stretched',
      [box(0, 100, 0, 300, 'tall'), box(112, 212, 0, 110), box(224, 324, 0, 120)],
      [0, 10, 0]
    ],
    ['a card stacked beside one of another step keeps its height', [box(0, 100, 0, 300, 'tall'), box(112, 212, 0, 100), box(112, 212, 112, 200)], [0, 0, 0]],
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

describe('tileLayouts', () => {
  it.each([
    [
      'tiles in a row stack together when one stacks, narrow or tall',
      [
        {top: 0, stacks: false},
        {top: 0, stacks: true},
        {top: 0, stacks: false}
      ],
      ['stacked', 'stacked', 'stacked']
    ],
    [
      'another row keeps its own layout',
      [
        {top: 0, stacks: true},
        {top: 122, stacks: false},
        {top: 122.4, stacks: false}
      ],
      ['stacked', 'inline', 'inline']
    ],
    [
      'a row of wide tiles stays inline',
      [
        {top: 0, stacks: false},
        {top: 0, stacks: false}
      ],
      ['inline', 'inline']
    ],
    [
      'a tall tile stacks alone among standard ones, and a short tile never stacks',
      [
        {top: 0, stacks: true, band: 'tall'},
        {top: 0, stacks: false, band: 'standard'},
        {top: 0, stacks: true, band: 'short'},
        {top: 0, stacks: false, band: 'short'}
      ],
      ['stacked', 'inline', 'inline', 'inline']
    ]
  ])('%s', (_, tiles, expected) => {
    expect(tileLayouts(tiles)).toEqual(expected);
  });
});
