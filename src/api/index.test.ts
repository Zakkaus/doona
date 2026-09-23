import {afterEach, expect, it, vi} from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function storage(values: Map<string, string>) {
  const port = {
    reads: 0,
    getItem: (key: string) => {
      port.reads++;
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  };
  return port;
}

it('reads storage for the client again only after a write, a storage event or the session lapsing', async () => {
  vi.useFakeTimers({now: Date.parse('2026-09-23T11:00:00Z')});
  const local = storage(new Map([['doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: 'https://home.example', token: ''}])]]));
  const session = storage(new Map());
  const window = new EventTarget();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('window', window);
  vi.resetModules();
  const {getApi} = await import('./index');
  const {writeProfiles} = await import('./profiles');
  const {saveSession} = await import('./session');
  const first = getApi();
  const reads = () => local.reads + session.reads;
  const before = reads();
  expect(getApi()).toBe(first);
  expect(reads()).toBe(before);

  window.dispatchEvent(new Event('storage'));
  expect(getApi()).toBe(first);
  expect(reads()).toBeGreaterThan(before);

  saveSession('home', 'https://home.example', 'hnk1_x', '2026-09-23T12:00:00Z');
  const signedIn = getApi();
  expect(signedIn).not.toBe(first);
  expect(getApi()).toBe(signedIn);
  vi.setSystemTime(Date.parse('2026-09-23T12:00:00Z'));
  const lapsed = getApi();
  expect(lapsed).not.toBe(signedIn);

  writeProfiles({profiles: [{id: 'home', name: 'Home', api: 'https://other.example', token: ''}], activeId: 'home'});
  expect(getApi()).not.toBe(lapsed);
});

it('keeps its backend when another tab deletes the profile this tab uses', async () => {
  const values = new Map([
    [
      'doona-profiles',
      JSON.stringify([
        {id: 'home', name: 'Home', api: 'https://home.example', token: 'a'},
        {id: 'work', name: 'Work', api: 'https://work.example', token: 'b'}
      ])
    ],
    ['doona-profile', 'home']
  ]);
  const window = new EventTarget();
  vi.stubGlobal('localStorage', storage(values));
  vi.stubGlobal('sessionStorage', storage(new Map()));
  vi.stubGlobal('window', window);
  vi.resetModules();
  const {getApi} = await import('./index');
  const home = getApi();
  values.set('doona-profiles', JSON.stringify([{id: 'work', name: 'Work', api: 'https://work.example', token: 'b'}]));
  window.dispatchEvent(new Event('storage'));
  expect(getApi()).toBe(home);
});

it('keeps its backend when another tab deletes every profile', async () => {
  const values = new Map([
    ['doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: 'https://home.example', token: 'a'}])],
    ['doona-profile', 'home']
  ]);
  const window = new EventTarget();
  vi.stubGlobal('localStorage', storage(values));
  vi.stubGlobal('sessionStorage', storage(new Map()));
  vi.stubGlobal('window', window);
  vi.resetModules();
  const {getApi} = await import('./index');
  const home = getApi();
  values.set('doona-profiles', '[]');
  window.dispatchEvent(new Event('storage'));
  getApi();
  await vi.dynamicImportSettled();
  window.dispatchEvent(new Event('storage'));
  expect(getApi()).toBe(home);
});
