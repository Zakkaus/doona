import {describe, expect, it} from 'vitest';
import {fitTags} from './Tag';

// Tags with an 8 px gap; the "+N" tag is 40 px for one digit and 48 px for two.
const more = (hidden: number) => (hidden < 10 ? 40 : 48);
const widths = [60, 80, 50];
const twelve = Array.from({length: 12}, () => 30);
describe('fitTags', () => {
  it.each([
    ['every tag fits', widths, 300, 3, 0],
    ['every tag fits exactly, with no room left for the overflow tag', widths, 206, 3, 0],
    ['the last tag gives way to the overflow tag', widths, 205, 2, 1],
    ['two tags and the overflow tag fill the width exactly', widths, 196, 2, 1],
    ['one pixel short drops the second tag too', widths, 195, 1, 2],
    ['only the overflow tag fits', widths, 107, 0, 3],
    ['a width narrower than the overflow tag still hides every tag', widths, 20, 0, 3],
    ['a fractional width within rounding counts as fitting', [60.004, 80, 50], 206, 3, 0],
    // Three tags end at 114 px; "+9" fits beside them where "+10" would not.
    ['a one-digit count leaves room a two-digit one would take', twelve, 154, 3, 9],
    ['a two-digit count takes its wider tag', twelve, 153, 2, 10],
    ['one tag wider than the cell goes behind the overflow tag', [400], 168, 0, 1],
    ['no tags', [], 100, 0, 0]
  ])('%s', (_, tags, width, visible, hidden) => {
    const count = fitTags(tags, more, width, 8);
    expect([count, tags.length - count]).toEqual([visible, hidden]);
  });
});
