import {afterEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({notify: vi.fn(), release: () => {}}));
vi.mock('react', () => ({
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (subscribe: (notify: () => void) => () => void, snapshot: () => unknown) => {
    state.release = subscribe(state.notify);
    return snapshot();
  }
}));
import type {Fold} from '../api/rings';
import {record, resetRings, useRings} from './rings';
type Sample = {time: number; value: number};
const fold: Fold<Sample> = (samples, time) => ({time, value: samples[0].value});
afterEach(() => {
  state.release();
  resetRings();
  state.notify.mockClear();
});
it('disabled metric kinds neither record samples nor subscribe to unrelated rings', () => {
  const sample = {time: Date.now(), value: 12};
  expect(useRings('unused', sample, value => value, fold, false)).toEqual({fine: [], coarse: []});
  expect(record('unused', undefined, fold).fine).toHaveLength(0);
  record('other', sample, fold);
  expect(state.notify).not.toHaveBeenCalled();
});
it('enabled metrics keep recording and receiving ring changes', () => {
  const sample = {time: Date.now(), value: 12};
  expect(useRings('used', sample, value => value, fold).fine).toEqual([sample]);
  record('used', {...sample, time: sample.time + 5000}, fold);
  expect(state.notify).toHaveBeenCalledOnce();
});

it('passive previews read existing rings without recording their cached resource', () => {
  const sample = {time: Date.now(), value: 12};
  record('preview', sample, fold);
  const convert = vi.fn((value: Sample) => value);
  expect(useRings('preview', undefined, convert, fold, true, true).fine).toEqual([sample]);
  expect(convert).not.toHaveBeenCalled();
  record('preview', {...sample, time: sample.time + 5000}, fold);
  expect(state.notify).not.toHaveBeenCalled();
});
