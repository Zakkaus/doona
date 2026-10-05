import {afterEach, beforeEach, expect, it, vi} from 'vitest';

type Port = {store: Map<string, string>; refuse: boolean} & Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function storage(): Port {
  const port: Port = {
    store: new Map(),
    refuse: false,
    getItem: key => port.store.get(key) ?? null,
    setItem: (key, value) => {
      if (port.refuse) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      port.store.set(key, value);
    },
    removeItem: key => void port.store.delete(key)
  };
  return port;
}

let local: Port;
let tab: Port;
// Every test loads the module afresh, as a new page would.
const load = () => import('./session');
beforeEach(() => {
  local = storage();
  tab = storage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', tab);
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const stored = (token: string, profileId = 'router', api = 'https://router.test') => JSON.stringify({profileId, api, token});

it('keeps a session in localStorage, where a new page finds it', async () => {
  (await load()).saveSession('router', 'https://router.test/', 'hnk1_x');
  expect(JSON.parse(local.store.get('doona-session')!)).toEqual({profileId: 'router', api: 'https://router.test', token: 'hnk1_x'});
  expect(tab.store.size).toBe(0);
  vi.resetModules();
  expect((await load()).sessionToken('router', 'https://router.test')).toBe('hnk1_x');
});

it('serves a session only to its own profile and endpoint', async () => {
  const {clearSession, saveSession, sessionToken} = await load();
  saveSession('router', 'https://router.test/', 'hnk1_x');
  expect(sessionToken('router', 'https://router.test')).toBe('hnk1_x');
  expect(sessionToken('other', 'https://router.test')).toBeNull();
  expect(sessionToken('router', 'https://elsewhere.test')).toBeNull();
  clearSession();
  expect(sessionToken('router', 'https://router.test')).toBeNull();
  expect(local.store.has('doona-session')).toBe(false);
});

it('keeps serving a session when the browser clock runs far ahead of the backend', async () => {
  // A router without an RTC hands out a session that ends before the browser's now; only its 401 ends it.
  local.store.set('doona-session', JSON.stringify({profileId: 'router', api: 'https://router.test', token: 'hnk1_x', expiresAt: '2026-09-23T12:00:00Z'}));
  vi.useFakeTimers({now: Date.parse('2026-09-24T00:30:00Z')});
  expect((await load()).sessionToken('router', 'https://router.test')).toBe('hnk1_x');
});

// A tab signed in before sessions outlived the tab signs in once more; its old copy is never read or carried over,
// so it cannot come back after a sign-out.
it('ignores a session left in sessionStorage from before', async () => {
  tab.store.set('doona-session', stored('hnk1_old'));
  expect((await load()).sessionToken('router', 'https://router.test')).toBeNull();
  expect(local.store.has('doona-session')).toBe(false);
});

it('drops a session the backend refused and reports it as ended', async () => {
  const {endSession, saveSession} = await load();
  saveSession('router', 'https://router.test', 'hnk1_x');
  expect(endSession('other', 'https://router.test')).toBe(false);
  expect(local.store.has('doona-session')).toBe(true);
  expect(endSession('router', 'https://router.test')).toBe(true);
  expect(local.store.has('doona-session')).toBe(false);
  // The page remembers the end until it is reloaded.
  expect(endSession('router', 'https://router.test')).toBe(true);
});

it('drops a session whose profile was deleted and keeps one whose profile remains', async () => {
  const {dropOrphanSession, saveSession} = await load();
  saveSession('router', 'https://router.test', 'hnk1_x');
  dropOrphanSession(['router', 'other']);
  expect(local.store.has('doona-session')).toBe(true);
  dropOrphanSession(['other']);
  expect(local.store.has('doona-session')).toBe(false);
});

it('throws when storage refuses a session, and reads none from unavailable storage', async () => {
  local.refuse = true;
  const {clearSession, saveSession, sessionToken} = await load();
  expect(() => saveSession('router', 'https://router.test', 'hnk1_x')).toThrow(DOMException);
  vi.stubGlobal('localStorage', undefined);
  expect(sessionToken('router', 'https://router.test')).toBeNull();
  expect(() => clearSession()).not.toThrow();
});
