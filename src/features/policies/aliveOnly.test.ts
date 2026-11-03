import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {storageKeys} from '../../api/storage';
import {readAliveOnly, saveAliveOnly} from './aliveOnly';
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key)
  });
});
afterEach(() => vi.unstubAllGlobals());
it('is off until the reader turns it on', () => {
  expect(readAliveOnly()).toBe(false);
});
it('keeps the choice for the next load and forgets it once turned off', () => {
  saveAliveOnly(true);
  expect(readAliveOnly()).toBe(true);
  saveAliveOnly(false);
  expect(readAliveOnly()).toBe(false);
  expect(stored.has(storageKeys.aliveOnly)).toBe(false);
});
it.each([
  ['an unknown value', () => void stored.set(storageKeys.aliveOnly, 'yes')],
  ['throwing on read', () => void (localStorage.getItem = raise)],
  ['throwing on write', () => void (localStorage.setItem = raise)],
  ['throwing on remove', () => void (localStorage.removeItem = raise)]
])('falls back to off when storage is %s', (_, spoil) => {
  spoil();
  expect(readAliveOnly()).toBe(false);
  expect(() => saveAliveOnly(true)).not.toThrow();
  expect(() => saveAliveOnly(false)).not.toThrow();
});
function raise(): never {
  throw new Error('Storage unavailable');
}
