import {serverNow} from './serverClock';

// Session polls extend the backend's ten-minute history: an hour at poll cadence, a week of stored minute buckets
// per profile.
export type Timed = {time: number};
export type Rings<T extends Timed> = {fine: T[]; coarse: T[]};
// How a bucket summarises its samples: the mean of a rate, the peak of a count.
export type Fold<T extends Timed> = (group: T[], time: number) => T;
export const fineLimit = 720;
const coarseLimit = 7 * 24 * 60;
export const minute = 60000;

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
export function window<T extends Timed>(rings: Rings<T>, history: T[], windowSeconds: number, fold: Fold<T>, now = serverNow(), maxPoints = 360) {
  const since = now - windowSeconds * 1000;
  const byTime = new Map<number, T>();
  for (const sample of rings.coarse) if (sample.time >= since - minute) byTime.set(sample.time, sample);
  for (const sample of rings.fine) if (sample.time >= since) byTime.set(sample.time, sample);
  for (const sample of history) if (sample.time >= since) byTime.set(sample.time, sample);
  let samples = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (samples.length > maxPoints) samples = bucket(samples, Math.ceil(windowSeconds / maxPoints), fold);
  return {samples, since, until: now};
}
