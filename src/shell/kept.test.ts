import {describe, expect, it} from 'vitest';
import {keepPages, type KeptPage} from './kept';

type Kept = ReadonlyArray<KeptPage<string>>;
const show = (kept: Kept, id: string, query = '', limit = 3) => keepPages(kept, {id, page: id, query}, limit);
const visit = (...ids: string[]) => ids.reduce<Kept>((kept, id) => show(kept, id), []);
const ids = (kept: Kept) => kept.map(entry => entry.id);

describe('keepPages', () => {
  it('keeps pages in the order they were first opened', () => {
    expect(ids(visit('a', 'b', 'c', 'a'))).toEqual(['a', 'b', 'c']);
  });

  it('drops the least recently shown page past the limit', () => {
    expect(ids(visit('a', 'b', 'c', 'a', 'd'))).toEqual(['a', 'c', 'd']);
    expect(ids(visit('a', 'b', 'c', 'd', 'e'))).toEqual(['c', 'd', 'e']);
  });

  it('returns the same list while the shown page and its query hold', () => {
    const kept = visit('a', 'b');
    expect(show(kept, 'b')).toBe(kept);
    expect(keepPages(kept, null)).toBe(kept);
  });

  it('records the query a page was last shown with and keeps it while hidden', () => {
    const kept = show(show(visit('a'), 'b', 'tab=x'), 'a');
    expect(kept.find(entry => entry.id === 'b')?.query).toBe('tab=x');
    expect(show(kept, 'a', 'q=1').find(entry => entry.id === 'a')?.query).toBe('q=1');
  });

  it('keeps the page a kept entry was first given', () => {
    const kept = visit('a', 'b');
    expect(keepPages(kept, {id: 'a', page: 'other', query: ''}).find(entry => entry.id === 'a')?.page).toBe('a');
  });
});
