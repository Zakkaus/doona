import type {LogLevel, LogRecord} from '../../api/model';
import {timeBuckets} from '../../ui/charts/layout';

// Most severe first, so the rows read top-down from what matters.
const severity: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

// Records per level per time bucket over the span the feed holds. Only levels the feed can contain are rows:
// those the backend offers at or above the chosen minimum.
export function levelHeatmap(records: Array<Pick<LogRecord, 'ts' | 'level'>>, levels: LogLevel[], minimum: LogLevel | '', room = 24) {
  const floor = minimum ? severity.indexOf(minimum) : severity.length - 1;
  const rows = severity.filter((level, i) => levels.includes(level) && i <= floor);
  const times = records.map(record => Date.parse(record.ts)).filter(Number.isFinite);
  if (!times.length) return {rows: rows.map(level => ({level, counts: [] as number[]})), buckets: [] as number[], width: 0, busiest: null};
  const since = Math.min(...times);
  const until = Math.max(...times);
  const buckets = timeBuckets(since, until, room);
  const width = buckets.length > 1 ? buckets[1] - buckets[0] : Math.max(until - since, 60000);
  const counts = new Map(rows.map(level => [level, new Array<number>(buckets.length).fill(0)]));
  const totals = new Array<number>(buckets.length).fill(0);
  const errors = new Array<number>(buckets.length).fill(0);
  for (const record of records) {
    const time = Date.parse(record.ts);
    const row = counts.get(record.level);
    if (!row || !Number.isFinite(time)) continue;
    const column = Math.min(buckets.length - 1, Math.floor((time - buckets[0]) / width));
    row[column]++;
    totals[column]++;
    if (record.level === 'error') errors[column]++;
  }
  const pick = (values: number[]) => values.reduce((best, value, i) => (value > values[best] ? i : best), 0);
  const errorTotal = errors.reduce((sum, value) => sum + value, 0);
  const column = errorTotal ? pick(errors) : pick(totals);
  return {
    rows: rows.map(level => ({level, counts: counts.get(level)!})),
    buckets,
    width,
    busiest: {start: buckets[column], count: errorTotal ? errors[column] : totals[column], errors: errorTotal}
  };
}
