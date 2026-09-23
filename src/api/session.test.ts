import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {clearSession, endSession, saveSession, sessionToken} from './session';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key)
  });
});
afterEach(() => {
  vi.useRealTimers();
});

it('serves a session only to its own profile and endpoint until it expires', () => {
  saveSession('router', 'https://router.test/', 'hnk1_x', '2026-09-23T12:00:00Z');
  const before = Date.parse('2026-09-23T11:59:59Z');
  expect(sessionToken('router', 'https://router.test', before)).toBe('hnk1_x');
  expect(sessionToken('other', 'https://router.test', before)).toBeNull();
  expect(sessionToken('router', 'https://elsewhere.test', before)).toBeNull();
  expect(sessionToken('router', 'https://router.test', Date.parse('2026-09-23T12:00:00Z'))).toBeNull();
  clearSession();
  expect(sessionToken('router', 'https://router.test', before)).toBeNull();
});

it('reports a session that lapsed on its own as ended and drops it from storage', () => {
  vi.useFakeTimers({now: Date.parse('2026-09-23T11:00:00Z')});
  saveSession('router', 'https://router.test', 'hnk1_x', '2026-09-23T12:00:00Z');
  vi.setSystemTime(Date.parse('2026-09-23T12:00:01Z'));
  expect(endSession('router', 'https://router.test')).toBe(true);
  expect(store.has('doona-session')).toBe(false);
});
