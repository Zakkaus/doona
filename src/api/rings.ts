import {useEffect, useSyncExternalStore} from 'react';
import {readProfiles} from './profiles';

// Extend the backend's ten-minute history with session polls: one hour at poll cadence, then a week of minute buckets persisted per profile.
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

// Persist each backend's history separately; storage failures only cost persistence.
const stores = new Map<string, {key: string; rings: Rings<Timed>; saved: number}>();
function storageKey(name: string) {
  const {activeId, profiles} = readProfiles();
  const api = profiles.find(profile => profile.id === activeId)?.api || 'mock';
  return `doona-rings-${name}-${JSON.stringify([activeId, api])}`;
}
function load<T extends Timed>(name: string): {key: string; rings: Rings<T>; saved: number} {
  const key = storageKey(name);
  const cached = stores.get(name);
  if (cached && cached.key === key) return cached as {key: string; rings: Rings<T>; saved: number};
  let rings: Rings<T> = {fine: [], coarse: []};
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Rings<T>).fine) && Array.isArray((parsed as Rings<T>).coarse))
      rings = parsed as Rings<T>;
  } catch {
    // Unreadable storage: the curve starts from this session.
  }
  const store = {key, rings, saved: Date.now()};
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
  const current = new Set([...stores.values()].map(store => store.key).concat(keep));
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
      save(store.key, JSON.stringify(next));
    }
  }
  return store.rings;
}
export function resetRings() {
  for (const store of stores.values()) {
    try {
      localStorage.removeItem(store.key);
    } catch {}
  }
  stores.clear();
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
