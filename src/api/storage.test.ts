import {expect, it} from 'vitest';
import {storageKeys} from './storage';

it('keeps the keys browsers already hold', () => {
  expect(Object.values(storageKeys)).toEqual([
    'doona-lang',
    'doona-scheme',
    'doona-palette',
    'doona-wordmark',
    'doona-mirror',
    'doona-toast-placement',
    'doona-profiles',
    'doona-profile',
    'doona-api',
    'doona-api-token',
    'doona-rings-',
    'doona-connections-view',
    'doona-session',
    'doona-saved',
    'doona-hub-pages'
  ]);
});
