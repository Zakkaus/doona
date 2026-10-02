import {expect, it, vi} from 'vitest';
import {writeProfiles} from '../api/profiles';
import {fineLimit, mean, type Fold} from '../api/rings';
import {pruneRings, record, resetRings} from './rings';

type Sample = {time: number; value: number | null};
const fold: Fold<Sample> = (group, time) => ({time, value: mean(group.map(s => s.value))});

it('does not persist a coarse-history wipe after an out-of-order poll', () => {
  const coarse = [{time: 0, value: 5.5}];
  const key = 'doona-rings-clock-["","mock"]';
  const storage = new Map([[key, JSON.stringify({fine: [{time: 3600000, value: 10}], coarse})]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  vi.useFakeTimers();
  try {
    record<Sample>('clock', undefined, fold);
    vi.advanceTimersByTime(60000);
    record('clock', {time: 3500000, value: null}, fold);
    vi.advanceTimersByTime(0);
    expect(JSON.parse(storage.get(key)!)).toEqual({fine: [{time: 3500000, value: null}]});
    expect(JSON.parse(storage.get(`${key}-coarse`)!)).toEqual(coarse);
  } finally {
    resetRings();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('writes the rings when the page is idle, and not after a reset', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  const idle: Array<() => void> = [];
  vi.stubGlobal('requestIdleCallback', (run: () => void) => idle.push(run));
  const key = 'doona-rings-idle-["","mock"]';
  vi.useFakeTimers();
  try {
    record<Sample>('idle', undefined, fold);
    vi.advanceTimersByTime(60000);
    record('idle', {time: 1, value: 1}, fold);
    record('idle', {time: 2, value: 2}, fold);
    expect(storage.has(key)).toBe(false);
    idle.shift()!();
    expect(JSON.parse(storage.get(key)!).fine).toHaveLength(2);
    vi.advanceTimersByTime(60000);
    record('idle', {time: 3, value: 3}, fold);
    resetRings();
    idle.shift()!();
    expect(storage.has(key)).toBe(false);
  } finally {
    resetRings();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('separates an edited backend while retaining history across credential changes', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  const profile = (api: string, token = '') => writeProfiles({profiles: [{id: 'home', name: 'Home', api, token}], activeId: 'home'});
  vi.useFakeTimers();
  try {
    profile('https://one.example/');
    record('backend', {time: 1, value: 10}, fold);
    vi.advanceTimersByTime(60000);
    record('backend', {time: 2, value: 20}, fold);
    vi.advanceTimersByTime(0);
    profile('https://two.example');
    expect(record<Sample>('backend', undefined, fold)).toEqual({fine: [], coarse: []});
    record('backend', {time: 3, value: 30}, fold);
    profile('https://one.example', 'new-secret');
    expect(record<Sample>('backend', undefined, fold).fine).toEqual([
      {time: 1, value: 10},
      {time: 2, value: 20}
    ]);
  } finally {
    resetRings();
    writeProfiles({profiles: [], activeId: ''});
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('keeps writing to its own backend when another tab edits the profile', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  try {
    writeProfiles({profiles: [{id: 'home', name: 'Home', api: 'https://one.example', token: ''}], activeId: 'home'});
    record('tabs', {time: 1, value: 10}, fold);
    storage.set('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: 'https://two.example', token: ''}]));
    expect(record<Sample>('tabs', {time: 2, value: 20}, fold).fine).toEqual([
      {time: 1, value: 10},
      {time: 2, value: 20}
    ]);
  } finally {
    resetRings();
    writeProfiles({profiles: [], activeId: ''});
    vi.unstubAllGlobals();
  }
});

// A storage whose items are its enumerable keys, as Object.keys sees them on the browser's Storage.
function enumerableStorage(entries: Record<string, string>) {
  const storage = {...entries};
  Object.defineProperties(storage, {
    getItem: {value: (key: string) => storage[key] ?? null},
    setItem: {value: (key: string, value: string) => void (storage[key] = value)},
    removeItem: {value: (key: string) => void delete storage[key]}
  });
  return storage;
}

it('writes the coarse ring at most every ten minutes', () => {
  const storage = enumerableStorage({});
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('requestIdleCallback', (run: () => void) => run());
  const key = 'doona-rings-coarse-["","mock"]-coarse';
  vi.useFakeTimers();
  const writes: string[] = [];
  try {
    record<Sample>('coarse', undefined, fold);
    for (let i = 0; i < fineLimit + 25 * 12; i++) {
      vi.advanceTimersByTime(5000);
      record('coarse', {time: i * 5000, value: i}, fold);
      if (storage[key] !== writes.at(-1)) writes.push(storage[key]);
    }
    // The first save, then one per ten minutes from the hour the fine ring overflows: 1, 61, 71 and 81 minutes.
    expect(writes).toHaveLength(4);
  } finally {
    resetRings();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('prunes the rings of a deleted or moved profile at startup', () => {
  const kept = 'doona-rings-traffic-["home","https://one.example"]';
  const storage = enumerableStorage({
    'doona-profiles': JSON.stringify([{id: 'home', name: 'Home', api: 'https://one.example', token: ''}]),
    'doona-profile': 'home',
    [kept]: '{}',
    [`${kept}-coarse`]: '[]',
    'doona-rings-traffic-["home","https://old.example"]': '{}',
    'doona-rings-memory-["gone","https://one.example"]-coarse': '[]'
  });
  vi.stubGlobal('localStorage', storage);
  try {
    pruneRings();
    expect(Object.keys(storage).filter(key => key.startsWith('doona-rings-'))).toEqual([kept, `${kept}-coarse`]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('starts fresh from a malformed stored ring', () => {
  const key = 'doona-rings-broken-["","mock"]';
  const storage = new Map([[key, JSON.stringify({fine: [null]})]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  try {
    expect(record('broken', {time: 1000, value: 1}, fold).fine).toEqual([{time: 1000, value: 1}]);
  } finally {
    resetRings();
    vi.unstubAllGlobals();
  }
});
