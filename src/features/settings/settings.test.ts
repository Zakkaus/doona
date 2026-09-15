import {describe, expect, it} from 'vitest';
import {normalizeApi, readSettings, shouldOpenSettings, writeSettings} from './settings';

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

it('preserves preferences across backend writes and validates before changing storage', () => {
  const values = new Map<string, string>();
  const storage = {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)};
  writeSettings({lang: 'en', scheme: 'dark', palette: 'nord/nord', wordmark: 'plain'}, storage);
  writeSettings({api: ' https://honk.example/proxy/ ', token: 'secret', backend: 'clash'}, storage);
  expect(readSettings(storage)).toEqual({
    api: 'https://honk.example/proxy',
    token: 'secret',
    backend: 'clash',
    lang: 'en',
    scheme: 'dark',
    palette: 'nord/nord',
    wordmark: 'plain'
  });
  const before = new Map(values);
  expect(() => writeSettings({token: 'replacement', api: '/invalid', backend: 'native'}, storage)).toThrow();
  expect(values).toEqual(before);
  writeSettings({api: 'mock', token: '', backend: 'native'}, storage);
  expect(readSettings(storage)).toEqual({
    api: 'mock',
    token: '',
    backend: 'native',
    lang: 'en',
    scheme: 'dark',
    palette: 'nord/nord',
    wordmark: 'plain'
  });
  expect([...values.keys()].sort()).toEqual(['doona-api', 'doona-api-token', 'doona-backend', 'doona-lang', 'doona-palette', 'doona-scheme', 'doona-wordmark']);
});

it('keeps demo navigation usable when storage is unavailable', () => {
  const settings = readSettings({
    getItem: () => {
      throw new Error('Storage denied');
    }
  });
  expect(settings.api).toBeNull();
  expect(settings.backend).toBe('native');
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
