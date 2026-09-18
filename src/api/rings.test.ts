import {expect, it} from 'vitest';
import {append, bucket, fineLimit, mean, window, type Fold} from './rings';

type Sample = {time: number; value: number | null};
const fold: Fold<Sample> = (group, time) => ({time, value: mean(group.map(s => s.value))});

it('keeps an hour of polls, folds evicted ones into minute buckets and restarts on a clock that went back', () => {
  let rings = {fine: [] as Sample[], coarse: [] as Sample[]};
  for (let i = 0; i <= fineLimit; i++) rings = append(rings, {time: i * 5000, value: i}, fold);
  expect(rings.fine.map(sample => sample.time)).toEqual(Array.from({length: fineLimit}, (_, i) => (i + 1) * 5000));
  expect(rings.coarse).toEqual([{time: 0, value: 0}]);
  // The same instant again changes nothing; the next eviction extends the open bucket.
  expect(append(rings, {time: fineLimit * 5000, value: 1}, fold)).toBe(rings);
  rings = append(rings, {time: (fineLimit + 1) * 5000, value: 1}, fold);
  expect(rings.coarse).toEqual([{time: 0, value: 0.5}]);
  expect(append(rings, {time: 0, value: null}, fold)).toEqual({fine: [{time: 0, value: null}], coarse: []});
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
