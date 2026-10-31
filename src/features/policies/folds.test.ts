import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {Profile} from '../../api/profiles';
import {storageKeys} from '../../api/storage';
import {readFold, saveFold} from './folds';
const profile = vi.hoisted(() => ({current: undefined as Profile | undefined}));
vi.mock('../../api/profiles', async importOriginal => ({...(await importOriginal<object>()), pinnedProfile: () => profile.current}));
const home: Profile = {id: 'home', name: 'Home', api: 'http://router:2023', token: ''};
const office: Profile = {id: 'office', name: 'Office', api: 'http://office:2023', token: ''};
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  profile.current = home;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value)
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['a manual group opens', false, true],
  ['an automatic group folds', true, false]
])('%s by default', (_, automatic, expanded) => {
  expect(readFold('g', automatic)).toBe(expanded);
});
it.each([
  ['manual', false],
  ['automatic', true]
])('remembers a %s group toggled from its default and forgets it once toggled back', (_, automatic) => {
  saveFold('g', automatic, automatic);
  expect(readFold('g', automatic)).toBe(automatic);
  expect(readFold('other', automatic)).toBe(!automatic);
  saveFold('g', automatic, !automatic);
  expect(readFold('g', automatic)).toBe(!automatic);
  expect(stored.get(storageKeys.policyFolds)).toBe('{}');
});
it.each([
  ['another profile', office],
  ['the demo backend', undefined]
])('keeps the folds of %s apart', (_, other) => {
  saveFold('g', false, false);
  profile.current = other;
  expect(readFold('g', false)).toBe(true);
  saveFold('g', false, false);
  profile.current = home;
  saveFold('g', false, true);
  profile.current = other;
  expect(readFold('g', false)).toBe(false);
});
it.each([
  ['unreadable', () => void stored.set(storageKeys.policyFolds, '{')],
  ['malformed', () => void stored.set(storageKeys.policyFolds, '[1]')],
  ['throwing on read', () => void (localStorage.getItem = raise)],
  ['throwing on write', () => void (localStorage.setItem = raise)]
])('falls back to the defaults when storage is %s', (_, spoil) => {
  spoil();
  expect(readFold('g', true)).toBe(false);
  expect(readFold('g', false)).toBe(true);
  expect(() => saveFold('g', false, false)).not.toThrow();
});
function raise(): never {
  throw new Error('Storage unavailable');
}
