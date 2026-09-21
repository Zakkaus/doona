import {expect, it, vi} from 'vitest';
import {append, bucket, fineLimit, mean, record, resetRings, window, type Fold} from './rings';

type Sample = {time: number; value: number | null};
const fold: Fold<Sample> = (group, time) => ({time, value: mean(group.map(s => s.value))});

it('folds each complete minute once without weighting its last polls', () => {
  let rings = {fine: [] as Sample[], coarse: [] as Sample[]};
  for (let i = 0; i <= fineLimit + 24; i++) rings = append(rings, {time: i * 5000, value: i}, fold);
  expect(rings.coarse).toEqual([
    {time: 0, value: 5.5},
    {time: 60000, value: 17.5}
  ]);
  expect(rings.fine[0].time).toBe(120000);
  expect(append(rings, rings.fine.at(-1)!, fold)).toBe(rings);
  const restored = JSON.parse(JSON.stringify(rings)) as typeof rings;
  expect(append(restored, {time: (fineLimit + 25) * 5000, value: 1000}, fold).coarse).toEqual(rings.coarse);
});

it('preserves coarse history when a clock moves backwards', () => {
  const rings = {fine: [{time: 3600000, value: 10}], coarse: [{time: 0, value: 5.5}]};
  expect(append(rings, {time: 3500000, value: null}, fold)).toEqual({
    fine: [{time: 3500000, value: null}],
    coarse: rings.coarse
  });
});

it('does not persist a coarse-history wipe after an out-of-order poll', () => {
  const coarse = [{time: 0, value: 5.5}];
  const key = 'doona-rings-clock-mock';
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
    expect(JSON.parse(storage.get(key)!)).toEqual({fine: [{time: 3500000, value: null}], coarse});
  } finally {
    resetRings();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('buckets by wall-clock intervals and ignores unknown values in the mean', () => {
  const samples = [
    {time: 1000, value: 1},
    {time: 59000, value: null},
    {time: 61000, value: 4}
  ];
  expect(bucket(samples, 60, fold)).toEqual([
    {time: 0, value: 1},
    {time: 60000, value: 4}
  ]);
});

it('windows the rings with the backend history, the newer source winning a shared instant', () => {
  const fine = [
    {time: 1000, value: 1},
    {time: 6000, value: 2},
    {time: 11000, value: 3}
  ];
  const history = [
    {time: 6000, value: 20},
    {time: 16000, value: 4}
  ];
  const series = window({fine, coarse: [{time: 0, value: 9}]}, history, 20, fold, 21000);
  expect(series.samples.map(sample => [sample.time, sample.value])).toEqual([
    [0, 9],
    [1000, 1],
    [6000, 20],
    [11000, 3],
    [16000, 4]
  ]);
  expect([series.since, series.until]).toEqual([1000, 21000]);
  expect(window({fine, coarse: []}, history, 10, fold, 21000).samples.map(sample => sample.time)).toEqual([11000, 16000]);
});

it('thins a long window to buckets', () => {
  const fine = Array.from({length: 720}, (_, i) => ({time: i * 5000, value: i}));
  const series = window({fine, coarse: []}, [], 3600, fold, 3600000, 60);
  expect(series.samples.length).toBe(60);
  expect(series.samples[0]).toEqual({time: 0, value: 5.5});
});
