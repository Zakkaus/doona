import {useState} from 'react';
import {readProfiles} from './profiles';

// Sample rings behind the home charts. The backend's own history covers ten minutes; the longer windows a
// router page is read at come from the polls this session collects: an hour at the poll cadence, then a
// week of minute buckets. The rings are kept for the whole session and in localStorage, so moving between
// pages or reloading does not start the curve over.
export type Timed = {time: number};
export type Rings<T extends Timed> = {fine: T[]; coarse: T[]};
// How a bucket summarises its samples: the mean of a rate, the peak of a count.
export type Fold<T extends Timed> = (group: T[], time: number) => T;
export const fineLimit = 720;
export const coarseLimit = 7 * 24 * 60;
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

// A sample older than the newest one means the backend's clock went back or it restarted: the curve starts
// over. Samples that fall out of the fine ring are folded into the minute bucket they belong to.
export function append<T extends Timed>(rings: Rings<T>, sample: T, fold: Fold<T>): Rings<T> {
  if (rings.fine.at(-1)?.time === sample.time) return rings;
  if (rings.fine.length && sample.time < rings.fine[rings.fine.length - 1].time) return {fine: [sample], coarse: []};
  const fine = [...rings.fine, sample];
  const evicted = fine.length > fineLimit ? fine.splice(0, fine.length - fineLimit) : [];
  let coarse = rings.coarse;
  if (evicted.length) {
    const from = Math.floor(evicted[0].time / minute) * minute;
    coarse = [...coarse.filter(c => c.time < from), ...bucket([...coarse.filter(c => c.time >= from), ...evicted], 60, fold)].slice(-coarseLimit);
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

// One store per chart, keyed by the profile so another backend's curve is never mixed in. Writes are paced
// to once a minute; a storage that throws (private mode, quota) only costs the persistence.
const stores = new Map<string, {key: string; rings: Rings<Timed>; saved: number}>();
function storageKey(name: string) {
  const {activeId} = readProfiles();
  return `doona-rings-${name}-${activeId || 'mock'}`;
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
export function record<T extends Timed>(name: string, sample: T | undefined, fold: Fold<T>): Rings<T> {
  const store = load<T>(name);
  if (!sample) return store.rings;
  const next = append(store.rings, sample, fold);
  if (next !== store.rings) {
    store.rings = next;
    const now = Date.now();
    if (now - store.saved >= minute) {
      store.saved = now;
      try {
        localStorage.setItem(store.key, JSON.stringify(next));
      } catch {
        // Full or unavailable storage: the rings live on in memory.
      }
    }
  }
  return store.rings;
}
// Test seam: forget every ring, in memory and in storage.
export function resetRings() {
  for (const store of stores.values()) {
    try {
      localStorage.removeItem(store.key);
    } catch {
      // Nothing stored.
    }
  }
  stores.clear();
}

// The source is compared by identity, so only a fresh poll appends a sample.
export function useRings<S, T extends Timed>(name: string, source: S | undefined, sample: (source: S) => T | undefined, fold: Fold<T>): Rings<T> {
  const [observed, setObserved] = useState(source);
  const [rings, setRings] = useState<Rings<T>>(() => record(name, source && sample(source), fold));
  if (observed !== source) {
    setObserved(source);
    setRings(record(name, source && sample(source), fold));
  }
  return rings;
}
