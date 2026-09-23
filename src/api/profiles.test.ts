import {expect, it, vi} from 'vitest';
import {detectHostedBackend} from './profiles';

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
