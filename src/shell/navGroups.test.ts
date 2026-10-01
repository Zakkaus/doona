import {afterEach, expect, it, vi} from 'vitest';
import {readNavGroups, saveNavGroups} from './navGroups';
afterEach(() => vi.unstubAllGlobals());
it('persists collapsed groups and rejects malformed storage', () => {
  let value = 'null';
  vi.stubGlobal('localStorage', {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    }
  });
  expect(readNavGroups()).toEqual([]);
  saveNavGroups(['settings']);
  expect(readNavGroups()).toEqual(['settings']);
});
