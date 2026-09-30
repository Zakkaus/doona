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

it('serves a session only to its own profile and endpoint', () => {
  saveSession('router', 'https://router.test/', 'hnk1_x');
  expect(sessionToken('router', 'https://router.test')).toBe('hnk1_x');
  expect(sessionToken('other', 'https://router.test')).toBeNull();
  expect(sessionToken('router', 'https://elsewhere.test')).toBeNull();
  clearSession();
  expect(sessionToken('router', 'https://router.test')).toBeNull();
});

it('keeps serving a session when the browser clock runs far ahead of the backend', () => {
  // A router without an RTC hands out a session that ends before the browser's now; only its 401 ends it.
  store.set('doona-session', JSON.stringify({profileId: 'router', api: 'https://router.test', token: 'hnk1_x', expiresAt: '2026-09-23T12:00:00Z'}));
  vi.useFakeTimers({now: Date.parse('2026-09-24T00:30:00Z')});
  expect(sessionToken('router', 'https://router.test')).toBe('hnk1_x');
});

it('drops a session the backend refused and reports it as ended', () => {
  saveSession('router', 'https://router.test', 'hnk1_x');
  expect(endSession('router', 'https://router.test')).toBe(true);
  expect(store.has('doona-session')).toBe(false);
});
