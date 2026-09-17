import {describe, expect, it} from 'vitest';
import {detectHostedBackend, hostedRoot, normalizeApi, normalizeProfiles, readProfiles, readSettings, shouldOpenSettings, writeProfiles} from './settings';

describe('backend URL normalization', () => {
  it.each([
    ['  https://honk.example/proxy/  ', 'https://honk.example/proxy'],
    ['http://localhost:9090///', 'http://localhost:9090'],
    ['https://[::1]:9443/honk', 'https://[::1]:9443/honk'],
    ['  mock  ', 'mock'],
    ['  ', '']
  ])('normalizes %s', (input, expected) => {
    expect(normalizeApi(input)).toBe(expected);
  });

  it.each([
    '/',
    '/proxy',
    'honk.example',
    '//honk.example',
    'ftp://honk.example',
    'http:///honk.example',
    'https://honk.example:99999',
    'https://user:secret@honk.example',
    'https://honk.example?token=secret',
    'https://honk.example/#fragment',
    'https://honk.example/a b',
    'https://honk.example\\proxy'
  ])('rejects %s', input => {
    expect(() => normalizeApi(input)).toThrow();
  });
});

function storageFrom(entries: Array<[string, string]> = []) {
  const values = new Map(entries);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}

it('migrates legacy credentials once and never resurrects a deleted profile', () => {
  const storage = storageFrom([
    ['doona-api', ' https://honk.example/proxy/ '],
    ['doona-api-token', 'secret']
  ]);
  const migrated = readProfiles(storage);
  expect(migrated.profiles).toEqual([{id: 'legacy', name: 'https://honk.example/proxy/', api: 'https://honk.example/proxy', token: 'secret'}]);
  expect(readSettings(storage).api).toBe('https://honk.example/proxy');
  expect(storage.getItem('doona-api')).toBeNull();
  expect(storage.getItem('doona-api-token')).toBeNull();
  expect(readProfiles(storage)).toEqual(migrated);
  writeProfiles({profiles: [], activeId: ''}, storage);
  storage.setItem('doona-api', 'mock');
  expect(readSettings(storage).api).toBeNull();
});

it('migrates an explicitly empty legacy endpoint as configured demo data', () => {
  const storage = storageFrom([['doona-api', '']]);
  expect(readSettings(storage).api).toBe('');
  expect(readProfiles(storage).profiles).toHaveLength(1);
});

it('normalizes saved profiles and falls back from a missing active id', () => {
  const values = [
    null,
    {},
    {id: 'bad', api: 'ftp://example.org'},
    {id: 'a', name: ' Home ', api: ' https://example.org/// ', token: ' secret '},
    {id: 'a', name: 'duplicate', api: 'mock'},
    {id: 'b', name: '', api: 'mock', token: 4}
  ];
  const profiles = normalizeProfiles(values);
  expect(profiles).toEqual([
    {id: 'a', name: 'Home', api: 'https://example.org', token: ' secret '},
    {id: 'b', name: 'mock', api: 'mock', token: ''}
  ]);
  const storage = storageFrom([
    ['doona-profiles', JSON.stringify(values)],
    ['doona-profile', 'missing']
  ]);
  expect(readSettings(storage).api).toBe('https://example.org');
  storage.setItem('doona-profile', 'b');
  expect(readSettings(storage).api).toBe('mock');
  storage.setItem('doona-profiles', '{');
  expect(readProfiles(storage)).toEqual({profiles: [], activeId: ''});
});

it('validates all backend URLs before writing and preserves appearance preferences', () => {
  const storage = storageFrom([
    ['doona-lang', 'en'],
    ['doona-scheme', 'dark']
  ]);
  const profile = {id: 'home', name: 'Home', api: 'mock', token: 'secret'};
  writeProfiles({profiles: [profile], activeId: 'home'}, storage);
  expect(() => writeProfiles({profiles: [{...profile, api: '/invalid'}], activeId: 'home'}, storage)).toThrow();
  expect(readSettings(storage)).toMatchObject({api: 'mock', token: 'secret', lang: 'en', scheme: 'dark'});
});

it('keeps demo navigation usable when storage is unavailable', () => {
  const settings = readSettings({
    ...storageFrom(),
    getItem: () => {
      throw new Error('Storage denied');
    }
  });
  expect(settings.api).toBeNull();
  expect(shouldOpenSettings(settings.api, '#/')).toBe(true);
});

describe('first-run routing', () => {
  it('opens settings only for an unset backend at the default route', () => {
    for (const hash of ['', '#', '#/']) expect(shouldOpenSettings(null, hash)).toBe(true);
    for (const hash of ['#/activity', '#/connections?src=192.0.2.1', '#/settings', '#/unknown']) {
      expect(shouldOpenSettings(null, hash)).toBe(false);
    }
  });

  it('treats explicitly saved empty and mock values as configured', () => {
    for (const api of ['', 'mock', 'https://honk.example']) {
      for (const hash of ['', '#/']) expect(shouldOpenSettings(api, hash)).toBe(false);
    }
  });
});

describe('hosted backend detection', () => {
  const at = (pathname: string, origin = 'http://127.0.0.1:9527') => ({origin, pathname, protocol: 'http:', host: '127.0.0.1:9527'});
  const answer = (status: number, headers: Record<string, string>, body?: unknown) =>
    (async () => new Response(body === undefined ? null : JSON.stringify(body), {status, headers})) as unknown as typeof fetch;

  it.each([
    ['/ui/', ''],
    ['/ui', ''],
    ['/ui/index.html', ''],
    ['/honk/ui/', '/honk'],
    ['/', ''],
    ['/doona/', '']
  ])('derives the API root from %s', (pathname, prefix) => {
    expect(hostedRoot(at(pathname))).toBe('http://127.0.0.1:9527' + prefix);
  });

  it('stores a hosted profile when discovery answers or challenges', async () => {
    for (const fetcher of [answer(200, {'content-type': 'application/json'}, {api_major: 1}), answer(401, {'www-authenticate': 'Bearer'})]) {
      const storage = storageFrom();
      expect(await detectHostedBackend(storage, at('/honk/ui/'), fetcher)).toBe(true);
      expect(readSettings(storage).api).toBe('http://127.0.0.1:9527/honk');
      expect(readProfiles(storage).profiles[0]?.name).toBe('127.0.0.1:9527');
    }
  });

  it('leaves the mock for a static host, a failed request, or an existing choice', async () => {
    const calls: string[] = [];
    const html = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('<!doctype html>', {status: 404, headers: {'content-type': 'text/html'}});
    }) as unknown as typeof fetch;
    expect(await detectHostedBackend(storageFrom(), at('/doona/'), html)).toBe(false);
    expect(calls).toEqual(['http://127.0.0.1:9527/api']);
    const failing = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await detectHostedBackend(storageFrom(), at('/ui/'), failing)).toBe(false);
    const chosen = storageFrom([['doona-profiles', '[]']]);
    expect(await detectHostedBackend(chosen, at('/ui/'), answer(200, {'content-type': 'application/json'}, {api_major: 1}))).toBe(false);
    expect(readProfiles(chosen).profiles).toEqual([]);
    expect(await detectHostedBackend(storageFrom(), {...at('/ui/'), protocol: 'file:'}, answer(200, {}, {}))).toBe(false);
  });
});
