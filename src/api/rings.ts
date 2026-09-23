import {useEffect, useSyncExternalStore} from 'react';
import {readProfiles} from './profiles';

// Session polls extend the backend's ten-minute history: an hour at poll cadence, a week of stored minute buckets
// per profile.
export type Timed = {time: number};
export type Rings<T extends Timed> = {fine: T[]; coarse: T[]};
// How a bucket summarises its samples: the mean of a rate, the peak of a count.
export type Fold<T extends Timed> = (group: T[], time: number) => T;
export const fineLimit = 720;
const coarseLimit = 7 * 24 * 60;
const minute = 60000;

export const mean = (values: Array<number | null>) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

export function bucket<T extends Timed>(samples: T[], seconds: number, fold: Fold<T>): T[] {
  const groups = new Map<number, T[]>();
  for (const sample of samples) {
    const key = Math.floor(sample.time / (seconds * 1000)) * seconds * 1000;
    const group = groups.get(key);
    if (group) group.push(sample);
    else groups.set(key, [sample]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([time, group]) => fold(group, time));
}

// Retain the boundary minute in fine so each coarse bucket is folded once from raw samples.
export function append<T extends Timed>(rings: Rings<T>, sample: T, fold: Fold<T>): Rings<T> {
  if (rings.fine.at(-1)?.time === sample.time) return rings;
  if (rings.fine.length && sample.time < rings.fine[rings.fine.length - 1].time) return {fine: [sample], coarse: rings.coarse};
  const fine = [...rings.fine, sample];
  const boundary = fine.length > fineLimit ? Math.floor(fine[fine.length - fineLimit].time / minute) * minute : -Infinity;
  let count = 0;
  while (count < fine.length && fine[count].time < boundary) count++;
  const evicted = fine.splice(0, count);
  let coarse = rings.coarse;
  if (evicted.length) {
    const byTime = new Map(bucket(evicted, 60, fold).map(sample => [sample.time, sample]));
    for (const sample of coarse) byTime.set(sample.time, sample);
    coarse = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-coarseLimit);
  }
  return {fine, coarse};
}

// The window's samples on one axis: minute buckets, then the session's polls, then the backend's ring, each
// winning a shared instant over the one before. Long windows are thinned to at most `maxPoints` buckets.
export function window<T extends Timed>(rings: Rings<T>, history: T[], windowSeconds: number, fold: Fold<T>, now = Date.now(), maxPoints = 360) {
  const since = now - windowSeconds * 1000;
  const byTime = new Map<number, T>();
  for (const sample of rings.coarse) if (sample.time >= since - minute) byTime.set(sample.time, sample);
  for (const sample of rings.fine) if (sample.time >= since) byTime.set(sample.time, sample);
  for (const sample of history) if (sample.time >= since) byTime.set(sample.time, sample);
  let samples = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (samples.length > maxPoints) samples = bucket(samples, Math.ceil(windowSeconds / maxPoints), fold);
  return {samples, since, until: now};
}

// Persist each backend's history separately; storage failures only cost persistence. The fine ring is written every
// minute; the coarse ring, up to a week of buckets, only every ten.
type Stored = {key: string; rings: Rings<Timed>; saved: number; coarseSaved: number; writtenCoarse: Timed[] | null};
const stores = new Map<string, Stored>();
const coarseEvery = 10 * minute;
const owner = (id: string, api: string) => JSON.stringify([id, api || 'mock']);
function storageKey(name: string) {
  const {activeId, profiles} = readProfiles();
  return `doona-rings-${name}-${owner(activeId, profiles.find(profile => profile.id === activeId)?.api ?? '')}`;
}
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Unreadable storage: the curve starts from this session.
    return null;
  }
}
// A stored ring someone else wrote or an older build left malformed is dropped, not charted.
function ring<T extends Timed>(value: unknown): T[] | null {
  return Array.isArray(value) && value.every(sample => typeof sample === 'object' && sample !== null && Number.isFinite((sample as Timed).time))
    ? (value as T[])
    : null;
}
function load<T extends Timed>(name: string): Stored & {rings: Rings<T>} {
  const key = storageKey(name);
  const cached = stores.get(name);
  if (cached && cached.key === key) return cached as Stored & {rings: Rings<T>};
  const stored = read(key) as {fine?: unknown; coarse?: unknown} | null;
  const coarse = read(`${key}-coarse`);
  // An older build kept both rings under one key.
  const rings = {fine: ring<T>(stored?.fine) ?? [], coarse: ring<T>(coarse) ?? ring<T>(stored?.coarse) ?? []};
  const store = {key, rings, saved: Date.now(), coarseSaved: 0, writtenCoarse: ring(coarse) ? rings.coarse : null};
  stores.set(name, store);
  return store;
}
// Rings of other backends are the first thing to give up when storage is full: the profiles and settings
// share the same quota and matter more than a curve's past.
function save(key: string, value: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      if (attempt || !prune(key)) return;
    }
  }
}
function prune(keep: string) {
  const current = new Set([...stores.values()].flatMap(store => [store.key, `${store.key}-coarse`]).concat(keep));
  let freed = false;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('doona-rings-') && !current.has(key)) {
        localStorage.removeItem(key);
        freed = true;
      }
    }
  } catch {
    // Unavailable storage: nothing to free.
  }
  return freed;
}
// A week of minute buckets takes a while to serialise, so the write waits for an idle moment rather than landing in
// the poll that produced it; a reset in between drops it, since the rings it would write are gone.
let resets = 0;
function saveWhenIdle(store: Stored, coarse: boolean) {
  const at = resets;
  const run = () => {
    if (at !== resets) return;
    save(store.key, JSON.stringify({fine: store.rings.fine}));
    if (coarse) save(`${store.key}-coarse`, JSON.stringify(store.rings.coarse));
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, {timeout: 5000});
  else setTimeout(run, 0);
}
// Rings whose profile is gone or points elsewhere: every profile change reloads the page, so this runs after each.
export function pruneRings() {
  const {profiles} = readProfiles();
  const owners = new Set(profiles.length ? profiles.map(profile => owner(profile.id, profile.api)) : [owner('', '')]);
  try {
    for (const key of Object.keys(localStorage)) {
      const found = /^doona-rings-.+?-(\[.*\])(?:-coarse)?$/.exec(key);
      if (key.startsWith('doona-rings-') && !(found && owners.has(found[1]))) localStorage.removeItem(key);
    }
  } catch {
    // Unavailable storage: nothing to prune.
  }
}
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function record<T extends Timed>(name: string, sample: T | undefined, fold: Fold<T>): Rings<T> {
  const store = load<T>(name);
  if (!sample) return store.rings;
  const next = append(store.rings, sample, fold);
  if (next !== store.rings) {
    store.rings = next;
    for (const listener of listeners) listener();
    const now = Date.now();
    if (now - store.saved >= minute) {
      store.saved = now;
      const coarse = store.rings.coarse !== store.writtenCoarse && now - store.coarseSaved >= coarseEvery;
      if (coarse) {
        store.coarseSaved = now;
        store.writtenCoarse = store.rings.coarse;
      }
      saveWhenIdle(store, coarse);
    }
  }
  return store.rings;
}
// For tests.
export function resetRings() {
  for (const store of stores.values()) {
    try {
      localStorage.removeItem(store.key);
      localStorage.removeItem(`${store.key}-coarse`);
    } catch {
      /* Storage can be unavailable. */
    }
  }
  stores.clear();
  resets++;
  for (const listener of listeners) listener();
}

// The store is the external system: a fresh poll (the source compared by identity) is recorded after render,
// and the component reads the ring the store holds.
export function useRings<S, T extends Timed>(name: string, source: S | undefined, sample: (source: S) => T | undefined, fold: Fold<T>): Rings<T> {
  useEffect(() => {
    record(name, source && sample(source), fold);
  }, [name, source, sample, fold]);
  // A render reads the ring already loaded; the next record re-checks the profile, so storage is not read per render.
  return useSyncExternalStore(subscribe, () => ((stores.get(name) as {rings: Rings<T>} | undefined) ?? load<T>(name)).rings);
}
