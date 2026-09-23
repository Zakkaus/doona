import {describe, expect, it} from 'vitest';
import {heatTone, logDomain, logPosition, logTicks, percentile, swarm, symlogPosition, thousandTicks, timeBuckets, waffleCells} from './layout';

describe('chart layout', () => {
  it('takes nearest-rank percentiles on odd and even counts', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(
      percentile(
        [...Array(100).keys()].map(n => n + 1),
        95
      )
    ).toBe(95);
  });

  it('spans whole decades on a log axis and places values inside it', () => {
    expect(logDomain([3, 420])).toEqual([1, 1000]);
    expect(logDomain([10])).toEqual([10, 100]);
    expect(logDomain([0, 0.2])).toEqual([1, 10]);
    expect(logTicks([1, 100])).toEqual([1, 2, 5, 10, 20, 50, 100]);
    expect(logTicks([1, 100000])).toEqual([1, 10, 100, 1000, 10000, 100000]);
    expect(logPosition(10, [1, 100])).toBeCloseTo(0.5);
    expect(logPosition(1000, [1, 100])).toBe(1);
  });

  it('packs a swarm so no two dots overlap and all stay inside the band', () => {
    const xs = [...Array(60)].map((_, i) => 100 + (i % 7));
    const ys = swarm(xs, 3, 40);
    for (const y of ys) expect(Math.abs(y)).toBeLessThanOrEqual(37);
    const inside = ys.filter(y => Math.abs(y) < 37);
    for (let a = 0; a < xs.length; a++)
      for (let b = a + 1; b < xs.length; b++)
        if (Math.abs(ys[a]) < 37 && Math.abs(ys[b]) < 37) expect(Math.hypot(xs[a] - xs[b], ys[a] - ys[b])).toBeGreaterThanOrEqual(6 - 1e-6);
    expect(inside.length).toBeGreaterThan(20);
    expect(swarm([10, 50, 90], 3, 20)).toEqual([0, 0, 0]);
  });

  it('fills a waffle with cells that add up and never hides a non-zero share', () => {
    expect(waffleCells([1, 1, 1])).toEqual([34, 33, 33]);
    expect(waffleCells([999, 1])).toEqual([99, 1]);
    expect(waffleCells([0, 0])).toEqual([0, 0]);
    expect(waffleCells([70, 20, 7, 3]).reduce((a, b) => a + b)).toBe(100);
  });

  it('steps heatmap tones from empty to busiest', () => {
    expect(heatTone(0, 10)).toBe(0);
    expect(heatTone(1, 100)).toBe(1);
    expect(heatTone(10, 10)).toBe(5);
    expect(heatTone(6, 10)).toBe(3);
  });

  it('chooses round time buckets with at most the columns asked for', () => {
    const since = Date.UTC(2026, 8, 23, 10, 0, 7);
    const buckets = timeBuckets(since, since + 60 * 60 * 1000, 24);
    expect(buckets.length).toBeLessThanOrEqual(25);
    expect(buckets[1] - buckets[0]).toBe(300000);
    expect(buckets[0] % 300000).toBe(0);
  });

  it('places zero at the origin of a symmetric log axis ending on a thousandfold', () => {
    expect(thousandTicks(0)).toEqual([0, 1000]);
    expect(thousandTicks(1.1e9)).toEqual([0, 1e3, 1e6, 1e9, 1e12]);
    expect(symlogPosition(0, 1e12)).toBe(0);
    expect(symlogPosition(1e12, 1e12)).toBe(1);
    expect(symlogPosition(1e6, 1e12)).toBeCloseTo(0.5, 2);
    expect(symlogPosition(-5, 1e12)).toBe(0);
  });
});
