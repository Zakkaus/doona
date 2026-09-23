// Pure layout for the charts drawn without a chart library; every function here is tested on its own.

// Nearest-rank percentile of values already sorted ascending; null for no values.
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

// A log axis from the decade at or below the least value to the decade at or above the greatest.
export function logDomain(values: number[], floor = 1): [number, number] {
  const positive = values.map(value => Math.max(value, floor));
  if (!positive.length) return [floor, floor * 10];
  const lo = 10 ** Math.floor(Math.log10(Math.min(...positive)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...positive)));
  return [lo, hi > lo ? hi : lo * 10];
}
// 1, 2 and 5 of each decade inside the domain; only the decades when that would crowd the axis.
export function logTicks([lo, hi]: [number, number], room = 8): number[] {
  const ticks: number[] = [];
  for (let decade = lo; decade <= hi; decade *= 10) for (const step of [1, 2, 5]) if (decade * step <= hi) ticks.push(decade * step);
  const isDecade = (tick: number) => Math.abs(Math.log10(tick) - Math.round(Math.log10(tick))) < 1e-9;
  return ticks.length > room ? ticks.filter(isDecade) : ticks;
}
// Position of a value on a log axis as a fraction from 0 to 1, values outside clamped to the ends.
export function logPosition(value: number, [lo, hi]: [number, number]): number {
  const clamped = Math.min(hi, Math.max(lo, value));
  return (Math.log10(clamped) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
}

// Beeswarm packing: each dot keeps its x and takes the offset nearest the centre line where it touches no dot
// already placed. Dots that find no room within the band stay on the band's edge rather than growing it.
export function swarm(xs: number[], radius: number, halfHeight: number): number[] {
  const order = xs.map((x, index) => ({x, index})).sort((a, b) => a.x - b.x);
  const placed: Array<{x: number; y: number}> = [];
  const ys = new Array<number>(xs.length).fill(0);
  const gap = radius * 2;
  for (const {x, index} of order) {
    // Only dots within one diameter to the left can touch, and `placed` is ordered by x.
    const near: Array<{x: number; y: number}> = [];
    for (let i = placed.length - 1; i >= 0 && x - placed[i].x < gap; i--) near.push(placed[i]);
    const free = (y: number) => near.every(dot => (dot.x - x) ** 2 + (dot.y - y) ** 2 >= gap * gap - 1e-6);
    let y = 0;
    for (let step = 0; !free(y); step++) {
      const offset = Math.ceil((step + 1) / 2) * (radius / 2);
      y = step % 2 ? offset : -offset;
      if (offset > halfHeight - radius) {
        y = Math.sign(y || 1) * (halfHeight - radius);
        break;
      }
    }
    ys[index] = y;
    placed.push({x, y});
  }
  return ys;
}

// Whole cells for each count out of `cells`, by largest remainder so the cells always add up.
export function waffleCells(counts: number[], cells = 100): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map(count => (count / total) * cells);
  const whole = exact.map(Math.floor);
  let left = cells - whole.reduce((sum, count) => sum + count, 0);
  const order = exact.map((value, index) => ({index, rest: value - whole[index]})).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const {index} of order) {
    if (!left) break;
    whole[index]++;
    left--;
  }
  // A non-zero count is never drawn as nothing; the cell comes from the largest share.
  for (let index = 0; index < counts.length; index++)
    if (counts[index] > 0 && whole[index] === 0) {
      const largest = whole.indexOf(Math.max(...whole));
      whole[largest]--;
      whole[index] = 1;
    }
  return whole;
}

// Tone step 0 (empty) to `steps` (the busiest cell) for a heatmap; any non-zero count is at least step 1.
export function heatTone(count: number, max: number, steps = 5): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((count / max) * steps));
}

// Time buckets covering [since, until]: a round width chosen so there are at most `room` columns.
const bucketWidths = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map(seconds => seconds * 1000);
export function timeBuckets(since: number, until: number, room = 24): number[] {
  const span = Math.max(until - since, 1);
  const width = bucketWidths.find(candidate => span / candidate <= room) ?? bucketWidths[bucketWidths.length - 1];
  const starts: number[] = [];
  for (let start = Math.floor(since / width) * width; start <= until; start += width) starts.push(start);
  return starts;
}

// Symmetric log position from 0 to 1 over [0, end]: zero sits at the origin and every thousandfold takes the
// same room, so a zero-byte connection and a gigabyte one share one axis.
export function symlogPosition(value: number, end: number): number {
  return Math.log10(1 + Math.max(0, Math.min(value, end))) / Math.log10(1 + end);
}
// 0 and every thousandfold up to the first at or above the greatest value: the next byte unit each step.
export function thousandTicks(max: number): number[] {
  const ticks = [0, 1000];
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] * 1000);
  return ticks;
}
