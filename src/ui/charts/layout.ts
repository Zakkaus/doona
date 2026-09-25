// Shared chart layout and axis helpers.

// Nearest-rank percentile of values already sorted ascending; null for no values.
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

// A log axis from the decade at or below the least value to the decade at or above the greatest.
export function logDomain(values: number[]): [number, number] {
  const positive = values.map(value => Math.max(value, 1));
  if (!positive.length) return [1, 10];
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
// already placed. A dot that finds no room within the band is not drawn; it is counted in `hidden`, grouped by
// where it would have stood, so a chart can say "+12" there instead of piling dots on top of each other.
export function swarm(xs: number[], radius: number, halfHeight: number): {ys: Array<number | null>; hidden: Array<{x: number; count: number}>} {
  const order = xs.map((x, index) => ({x, index})).sort((a, b) => a.x - b.x);
  const placed: Array<{x: number; y: number}> = [];
  const ys = new Array<number | null>(xs.length).fill(0);
  const hidden: Array<{x: number; count: number}> = [];
  const gap = radius * 2;
  const reach = halfHeight - radius;
  for (const {x, index} of order) {
    // Only dots within one diameter to the left can touch, and `placed` is ordered by x.
    const near: Array<{x: number; y: number}> = [];
    for (let i = placed.length - 1; i >= 0 && x - placed[i].x < gap; i--) near.push(placed[i]);
    const free = (y: number) => near.every(dot => (dot.x - x) ** 2 + (dot.y - y) ** 2 >= gap * gap - 1e-6);
    let y: number | null = 0;
    for (let step = 0; !free(y); step++) {
      const offset = Math.ceil((step + 1) / 2) * (radius / 2);
      if (offset > reach) {
        y = null;
        break;
      }
      y = step % 2 ? offset : -offset;
    }
    ys[index] = y;
    if (y === null) {
      const last = hidden[hidden.length - 1];
      if (last && x - last.x < gap) last.count++;
      else hidden.push({x, count: 1});
    } else placed.push({x, y});
  }
  return {ys, hidden};
}

// Whole cells for each count out of a hundred, by largest remainder so the cells always add up.
export function waffleCells(counts: number[]): number[] {
  const cells = 100;
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

// Tone step 0 (empty) to 5 (the busiest cell) for a heatmap; any non-zero count is at least step 1.
export function heatTone(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((count / max) * 5));
}

// Time buckets covering [since, until]: the smallest round width whose aligned buckets number at most `room`.
const bucketWidths = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400, 172800, 604800, 2592000].map(seconds => seconds * 1000);
export function timeBuckets(since: number, until: number, room = 24): number[] {
  const count = (width: number) => Math.floor(until / width) - Math.floor(since / width) + 1;
  let width = bucketWidths.find(candidate => count(candidate) <= room);
  // Past a month a bucket is a whole number of months' worth of days, still within the room.
  if (width === undefined) width = Math.ceil((until - since) / (room - 1) / bucketWidths[bucketWidths.length - 1]) * bucketWidths[bucketWidths.length - 1];
  const starts: number[] = [];
  for (let start = Math.floor(since / width) * width; start <= until; start += width) starts.push(start);
  return starts;
}

// Symmetric log position from 0 to 1 over [0, end]: zero sits at the origin and every thousandfold takes the
// same room, so a zero-byte connection and a gigabyte one share one axis.
export function symlogPosition(value: number, end: number): number {
  return Math.log10(1 + Math.max(0, Math.min(value, end))) / Math.log10(1 + end);
}
// A symmetric log axis for values up to `max`: it ends just past the data rather than at the next thousandfold,
// with a tick at 0 and at every thousandfold inside it.
export function symlogAxis(max: number): {end: number; ticks: number[]} {
  const end = Math.max(1000, max * 2);
  const ticks = [0];
  for (let tick = 1000; tick <= end; tick *= 1000) ticks.push(tick);
  return {end, ticks};
}

export function linearPosition(value: number, [lo, hi]: [number, number], [start, end]: [number, number]): number {
  const fraction = hi === lo ? 0.5 : (value - lo) / (hi - lo);
  return start * (1 - fraction) + end * fraction;
}

// Keep the last label, optionally the first, shifting end labels inside the SVG before thinning.
export function visibleTicks(positions: number[], sizes: number[], start: number, end: number, gap: number, preserveStart: boolean) {
  if (!positions.length) return [];
  const sign = positions.length > 1 && positions[1] < positions[0] ? -1 : 1;
  let lo = start;
  let hi = end;
  const shown: Array<{index: number; position: number}> = [];
  const last = positions.length - 1;
  const visit = (index: number) => {
    const size = sizes[index];
    if (!Number.isFinite(size) || !Number.isFinite(positions[index])) return;
    let pos = sign * positions[index];
    if (index === last) pos = Math.min(pos, hi - size / 2);
    else if (index === 0 && preserveStart) pos = Math.max(pos, lo + size / 2);
    if (pos - size / 2 < lo || pos + size / 2 > hi) return;
    shown.push({index, position: sign * pos});
    if (preserveStart && index !== last) lo = pos + size / 2 + gap;
    else hi = pos - size / 2 - gap;
  };
  if (sign < 0) {
    lo = -end;
    hi = -start;
  }
  visit(last);
  if (preserveStart) for (let i = 0; i < last; i++) visit(i);
  else for (let i = last - 1; i >= 0; i--) visit(i);
  return shown.sort((a, b) => a.index - b.index);
}

export function nearestIndex(positions: number[], coordinate: number): number {
  let index = 0;
  for (let i = 1; i < positions.length; i++) if (Math.abs(positions[i] - coordinate) < Math.abs(positions[index] - coordinate)) index = i;
  return index;
}
