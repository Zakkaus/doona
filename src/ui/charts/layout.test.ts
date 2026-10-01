import {describe, expect, it} from 'vitest';
import {
  donutAngles,
  linearPosition,
  visibleTicks,
  nearestIndex,
  heatTone,
  logDomain,
  logPosition,
  logTicks,
  percentile,
  swarm,
  symlogAxis,
  symlogPosition,
  timeBuckets,
  waffleCells
} from './layout';

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

  it('packs a swarm so no two drawn dots overlap, and counts the dots with no room instead of piling them', () => {
    const xs = [...Array(60)].map((_, i) => 100 + (i % 7));
    const {ys, hidden} = swarm(xs, 3, 40);
    const drawn = xs.map((x, i) => ({x, y: ys[i]})).filter((dot): dot is {x: number; y: number} => dot.y !== null);
    for (const dot of drawn) expect(Math.abs(dot.y)).toBeLessThanOrEqual(37);
    for (let a = 0; a < drawn.length; a++)
      for (let b = a + 1; b < drawn.length; b++) expect(Math.hypot(drawn[a].x - drawn[b].x, drawn[a].y - drawn[b].y)).toBeGreaterThanOrEqual(6 - 1e-6);
    expect(drawn.length + hidden.reduce((sum, group) => sum + group.count, 0)).toBe(60);
    const same = swarm(Array(20).fill(100), 4, 20);
    expect(same.ys.filter(y => y !== null)).toHaveLength(5);
    expect(same.hidden).toEqual([{x: 100, count: 15}]);
    expect(swarm([10, 50, 90], 3, 20)).toEqual({ys: [0, 0, 0], hidden: []});
  });

  it('fills a waffle with cells that add up and never hides a non-zero share', () => {
    expect(waffleCells([1, 1, 1])).toEqual([34, 33, 33]);
    expect(waffleCells([999, 1])).toEqual([99, 1]);
    expect(waffleCells([0, 0])).toEqual([0, 0]);
    expect(waffleCells([70, 20, 7, 3]).reduce((a, b) => a + b)).toBe(100);
  });

  it('keeps every donut slice at a non-negative angle when too many slices need the minimum', () => {
    for (const values of [
      [1000, ...Array<number>(60).fill(1)],
      [1000, ...Array<number>(99).fill(1)]
    ]) {
      const angles = donutAngles(values);
      for (const angle of angles) expect(angle).toBeGreaterThanOrEqual(0);
      expect(angles.reduce((a, b) => a + b)).toBeCloseTo(360);
    }
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
    // A year of records still fits the columns asked for.
    expect(timeBuckets(Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1), 24).length).toBeLessThanOrEqual(24);
    expect(timeBuckets(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 8), 24).length).toBeLessThanOrEqual(24);
  });

  it('places zero at the origin of a symmetric log axis ending on a thousandfold', () => {
    expect(symlogAxis(0)).toEqual({end: 1000, ticks: [0, 1000]});
    expect(symlogAxis(1.1e9)).toEqual({end: 2.2e9, ticks: [0, 1e3, 1e6, 1e9]});
    expect(symlogPosition(0, 1e12)).toBe(0);
    expect(symlogPosition(1e12, 1e12)).toBe(1);
    expect(symlogPosition(1e6, 1e12)).toBeCloseTo(0.5, 2);
    expect(symlogPosition(-5, 1e12)).toBe(0);
  });
});

describe('linearPosition', () => {
  it('interpolates without clipping, centring a constant domain', () => {
    expect(linearPosition(15, [10, 20], [20, 120])).toBe(70);
    expect(linearPosition(30, [10, 20], [20, 120])).toBe(220);
    expect(linearPosition(7, [7, 7], [20, 120])).toBe(70);
  });
});
it('keeps end ticks and thins overlapping interior labels', () => {
  expect(visibleTicks([10, 30, 50, 70, 90], [20, 20, 20, 20, 20], 0, 100, 16, true)).toEqual([
    {index: 0, position: 10},
    {index: 2, position: 50},
    {index: 4, position: 90}
  ]);
});

it('omits ticks until their label dimensions are measured', () => {
  expect(visibleTicks([10, 50], [], 0, 100, 16, true)).toEqual([]);
});
it('selects the nearest sample, keeping the earlier sample at a midpoint', () => {
  expect(nearestIndex([0, 10, 20], 5)).toBe(0);
  expect(nearestIndex([0, 10, 20], 16)).toBe(2);
});
