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
      // A count's label is about 24px wide: counts nearer than that share one label rather than overprint.
      if (last && x - last.x < Math.max(gap, 24)) last.count++;
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

// Degrees for each nonzero donut slice, in order. A slice under six degrees is drawn at six, as Recharts' minimum
// angle does, and the rest share what is left in proportion; past sixty slices the minimum shrinks to an equal share.
export function donutAngles(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  const minimum = values.some(value => (value / total) * 360 < 6) ? Math.min(6, 360 / values.length) : 0;
  return values.map(value => minimum + (value / total) * (360 - values.length * minimum));
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

// A range's line in percent of the axis [0, max], both ends held inside the axis; zero wide when the ends meet.
export function lineSpan([low, high]: [number, number], max: number): {start: number; width: number} {
  const at = (value: number) => Math.min(100, Math.max(0, (value / max) * 100));
  return {start: at(low), width: at(high) - at(low)};
}

// Rows [start, end) of a list of `count` rows, each `height` tall from `top` (relative to the viewport), that meet a
// viewport `viewport` tall, widened by `overscan` rows each way and kept inside the list.
export function visibleRows(count: number, top: number, height: number, viewport: number, overscan: number): {start: number; end: number} {
  const start = Math.max(0, Math.min(count, Math.floor(-top / height) - overscan));
  const end = Math.max(start, Math.min(count, Math.ceil((viewport - top) / height) + overscan));
  // A list wholly off screen still mounts its nearest row, so its row height can be measured again after a resize.
  if (start === end && count) return start ? {start: count - 1, end: count} : {start: 0, end: 1};
  return {start, end};
}

// The row ranges a windowed list mounts: the window, and the focused row (-1 for none) wherever it lies, in order and
// merged where they touch.
export function mountedRanges(window: {start: number; end: number}, focused: number): Array<{start: number; end: number}> {
  if (focused < 0 || (focused >= window.start && focused < window.end)) return [window];
  if (focused === window.end) return [{start: window.start, end: focused + 1}];
  if (focused === window.start - 1) return [{start: focused, end: window.end}];
  const row = {start: focused, end: focused + 1};
  return focused < window.start ? [row, window] : [window, row];
}

export function linearPosition(value: number, [lo, hi]: [number, number], [start, end]: [number, number]): number {
  const fraction = hi === lo ? 0.5 : (value - lo) / (hi - lo);
  return start * (1 - fraction) + end * fraction;
}

// A value axis over the values one plot draws: from zero (`zero`) or from a round step under the least value (`auto`),
// to a round top a little above the greatest, with a tick at each end and one halfway, each a number its label prints
// exactly (the half of 1.5 MB is 750 kB, never a rounded 1.3 MB).
const roundTops = [1, 1.2, 1.5, 2, 3, 4, 5, 6, 8, 10];
export function valueAxis(values: number[], baseline: 'zero' | 'auto'): {domain: [number, number]; ticks: [number, number, number]} {
  const top = Math.max(1, ...values);
  if (baseline === 'auto' && values.length) {
    const least = Math.min(...values);
    const decade = 10 ** Math.floor(Math.log10(Math.max(top - least, top * 0.02, 1)));
    const ratio = Math.max(top - least, top * 0.02, 1) / decade;
    // A label shows whole units from ten of a unit and tenths below, units a thousand apart (formatBytes), so a step
    // finer than that would print two ticks alike.
    const unit = 1000 ** Math.floor(Math.log10(top) / 3);
    const resolution = top / unit >= 10 ? unit : unit / 10;
    const step = Math.max(resolution, Math.round(((ratio <= 1 ? 0.2 : ratio <= 2 ? 0.5 : ratio <= 5 ? 1 : 2) * decade) / resolution) * resolution);
    const lo = Math.max(0, Math.floor(least / step) * step - step);
    // An even number of steps, so the middle tick falls on a step too.
    let steps = Math.ceil(top / step) + 1 - lo / step;
    steps += steps % 2;
    const hi = lo + steps * step;
    return {domain: [lo, hi], ticks: [lo, (lo + hi) / 2, hi]};
  }
  const decade = 10 ** Math.floor(Math.log10(top * 1.05));
  const hi = (roundTops.find(k => k * decade >= top * 1.05) ?? 10) * decade;
  return {domain: [0, hi], ticks: [0, hi / 2, hi]};
}

// A series' peak, the sample it falls on, and its average over the samples a chart draws; null without a sample.
export function seriesStats(values: (number | null)[]): {peak: number; at: number; average: number} | null {
  let at = -1;
  let sum = 0;
  let count = 0;
  values.forEach((value, index) => {
    if (value === null) return;
    if (at < 0 || value > values[at]!) at = index;
    sum += value;
    count++;
  });
  return count ? {peak: values[at]!, at, average: sum / count} : null;
}

// Labels along one edge, placed in the order given (the most wanted first): each centred on its position, moved inside
// [start, end], and dropped when it would come within `gap` of a label already placed.
export function placeLabels(labels: Array<{index: number; position: number; size: number}>, start: number, end: number, gap: number) {
  const placed: Array<{index: number; position: number; size: number}> = [];
  for (const {index, position, size} of labels) {
    if (!Number.isFinite(size) || !Number.isFinite(position) || size > end - start) continue;
    const centre = Math.min(Math.max(position, start + size / 2), end - size / 2);
    if (placed.some(label => Math.abs(label.position - centre) < (label.size + size) / 2 + gap)) continue;
    placed.push({index, position: centre, size});
  }
  return placed.sort((a, b) => a.position - b.position).map(({index, position}) => ({index, position}));
}

// Time labels under a plot from `start` to `end`: the round times between its ends (`ticks` 1 to n - 2), every one, or
// every second, third... while any two would come within `gap`, none crossing the plot's edges; then the plot's first
// and last times (`ticks` 0 and n - 1), set flush with its edges, each only where it clears its neighbour by `endGap`.
export function clockLabels(ticks: Array<{position: number; width: number}>, start: number, end: number, gap: number, endGap: number) {
  const box = (index: number, centre = ticks[index].position) => [centre - ticks[index].width / 2, centre + ticks[index].width / 2];
  const inner = ticks.map((_, index) => index).filter(index => index > 0 && index < ticks.length - 1 && box(index)[0] >= start && box(index)[1] <= end);
  let shown = inner;
  for (let stride = 2; shown.some((index, i) => i > 0 && box(index)[0] < box(shown[i - 1])[1] + gap); stride++)
    shown = inner.filter((_, i) => i % stride === 0);
  const labels = shown.map(index => ({index, position: ticks[index].position}));
  const last = ticks.length - 1;
  if (last > 0) {
    const first = start + ticks[0].width / 2;
    if (!labels.length || box(labels[0].index)[0] >= start + ticks[0].width + endGap) labels.unshift({index: 0, position: first});
    const final = end - ticks[last].width / 2;
    if (!labels.length || box(labels[labels.length - 1].index, labels[labels.length - 1].position)[1] <= end - ticks[last].width - endGap)
      labels.push({index: last, position: final});
  }
  return labels;
}

// Ticks at fixed samples keep the last one, and each earlier one only when its label clears the next kept label by
// `gap`; a narrow plot shows the first and last labels, or only the last. A label centres on its sample, moved inwards
// where it would cross the plot's edges at 0 and `width`, so the plot starts at the card's text inset with its first
// label whole.
export function sampleTicks(positions: number[], widths: number[], gap: number, width: number) {
  const centre = (index: number) => Math.min(Math.max(positions[index], (widths[index] ?? 0) / 2), width - (widths[index] ?? 0) / 2);
  const box = (index: number) => [centre(index) - (widths[index] ?? 0) / 2, centre(index) + (widths[index] ?? 0) / 2];
  const last = positions.length - 1;
  const shown: Array<{index: number; position: number}> = [];
  let end = Infinity;
  for (let index = last; index >= 0; index--) {
    const [start, stop] = box(index);
    if (stop + gap > end || (index > 0 && index < last && start < box(0)[1] + gap)) continue;
    shown.unshift({index, position: centre(index)});
    end = start;
  }
  return shown;
}

export function nearestIndex(positions: number[], coordinate: number): number {
  let index = 0;
  for (let i = 1; i < positions.length; i++) if (Math.abs(positions[i] - coordinate) < Math.abs(positions[index] - coordinate)) index = i;
  return index;
}
