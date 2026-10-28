import {expect, it, vi} from 'vitest';
import {detectHostedBackend, suggestedBackendUrl} from './profiles';

it.each(['discovery', 'challenge'])('keeps standard hosted profile creation after a %s response', async kind => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  };
  const cancel = vi.fn();
  const fetcher = vi.fn(async () =>
    kind === 'discovery' ? Response.json({api_major: 1}) : new Response(new ReadableStream({cancel}), {status: 401, headers: {'WWW-Authenticate': 'Bearer'}})
  );
  await expect(
    detectHostedBackend(storage, {origin: 'https://honk.example', pathname: '/router/ui/', protocol: 'https:', host: 'honk.example'}, fetcher)
  ).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledWith('https://honk.example/router/api', expect.objectContaining({cache: 'no-store', headers: {Accept: 'application/json'}}));
  expect(JSON.parse(values.get('doona-profiles')!)).toEqual([{id: 'hosted', name: 'honk.example', api: 'https://honk.example/router', token: ''}]);
  expect(values.get('doona-profile')).toBe('hosted');
  expect(cancel).toHaveBeenCalledTimes(kind === 'challenge' ? 1 : 0);
});

it.each(['doona-profiles', 'doona-api'])('does not probe or overwrite existing standard settings in %s', async key => {
  const storage = {getItem: (name: string) => (name === key ? '' : null), setItem: vi.fn(), removeItem: vi.fn()};
  const fetcher = vi.fn();
  await expect(
    detectHostedBackend(storage, {origin: 'https://honk.example', pathname: '/ui/', protocol: 'https:', host: 'honk.example'}, fetcher)
  ).resolves.toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('continues startup when accessing browser storage throws', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('Storage denied');
    }
  });
  const fetcher = vi.fn();
  try {
    await expect(
      detectHostedBackend(undefined, {origin: 'https://honk.example', pathname: '/ui/', protocol: 'https:', host: 'honk.example'}, fetcher)
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

it('keeps the profile this page loaded with when another tab chooses a different one', async () => {
  const values = new Map<string, string>([
    [
      'doona-profiles',
      JSON.stringify([
        {id: 'a', name: 'A', api: 'https://a.example', token: ''},
        {id: 'b', name: 'B', api: 'https://b.example', token: ''}
      ])
    ],
    ['doona-profile', 'a']
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => storage});
  vi.resetModules();
  const {readProfiles, writeProfiles} = await import('./profiles');
  try {
    expect(readProfiles().activeId).toBe('a');
    values.set('doona-profile', 'b');
    expect(readProfiles().activeId).toBe('a');
    // An explicit storage reads what is saved, as the other tab would after its reload.
    expect(readProfiles(storage).activeId).toBe('b');
    writeProfiles({profiles: readProfiles().profiles, activeId: 'b'});
    expect(readProfiles().activeId).toBe('b');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

it('gives up stored chart history to save the profiles when storage is full', async () => {
  const storage: Record<string, string> = {'doona-rings-traffic-["a","mock"]': 'x'.repeat(40)};
  Object.defineProperties(storage, {
    getItem: {value: (key: string) => storage[key] ?? null},
    setItem: {
      value: (key: string, value: string) => {
        if (Object.values(storage).join('').length + value.length > 60) throw new DOMException('Full', 'QuotaExceededError');
        storage[key] = value;
      }
    },
    removeItem: {value: (key: string) => void delete storage[key]}
  });
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  const {writeProfiles} = await import('./profiles');
  try {
    writeProfiles({profiles: [{id: 'a', name: 'A', api: 'mock', token: ''}], activeId: 'a'});
    expect(Object.keys(storage)).toEqual(['doona-profiles', 'doona-profile']);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('clears only the saved token of the profile signing out', async () => {
  vi.resetModules();
  const {clearProfileToken} = await import('./profiles');
  const values = new Map<string, string>([
    [
      'doona-profiles',
      JSON.stringify([
        {id: 'a', name: 'A', api: 'https://a.example', token: 'secret-a'},
        {id: 'b', name: 'B', api: 'https://b.example', token: 'secret-b'}
      ])
    ],
    ['doona-profile', 'a']
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  };
  clearProfileToken('a', storage);
  expect(JSON.parse(values.get('doona-profiles')!)).toEqual([
    {id: 'a', name: 'A', api: 'https://a.example', token: ''},
    {id: 'b', name: 'B', api: 'https://b.example', token: 'secret-b'}
  ]);
  expect(values.get('doona-profile')).toBe('a');
  // Nothing to forget writes nothing, so a store that could not be read is never replaced by an empty list.
  const unreadable = {...storage, getItem: () => '{', setItem: vi.fn()};
  clearProfileToken('a', unreadable);
  expect(unreadable.setItem).not.toHaveBeenCalled();
});

it('suggests honk on the page host when no backend is saved', () => {
  expect(suggestedBackendUrl({protocol: 'http:', hostname: '192.168.1.1'})).toBe('http://192.168.1.1:9527');
  expect(suggestedBackendUrl({protocol: 'https:', hostname: 'honk.example'})).toBe('');
  expect(suggestedBackendUrl(new URL('http://[::1]:8080/ui/'))).toBe('http://[::1]:9527');
  expect(suggestedBackendUrl({protocol: 'file:', hostname: ''})).toBe('');
  expect(suggestedBackendUrl({protocol: 'http:', hostname: ''})).toBe('');
});
