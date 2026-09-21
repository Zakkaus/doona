type U64 = string | bigint | null;
const MAX = (1n << 64n) - 1n;

export function parseU64(s: string | null): bigint | null {
  if (s === null) return null;
  if (s.length > 20 || !/^(0|[1-9][0-9]*)$/.test(s)) return null;
  const value = BigInt(s);
  if (value > MAX) return null;
  return value;
}

function valueOf(value: U64): bigint | null {
  if (typeof value !== 'bigint') return parseU64(value);
  if (value < 0n) throw new RangeError('Unsigned value must not be negative');
  return value;
}

/** Unknown counters remain unknown, including in aggregates. */
export function addU64(...values: U64[]): bigint | null {
  let total = 0n;
  for (const input of values) {
    const value = valueOf(input);
    if (value === null) return null;
    total += value;
  }
  return total;
}

/** Only the bounded percentage is converted to Number. */
export function pctU64(part: U64, whole: U64): number | null {
  const p = valueOf(part),
    w = valueOf(whole);
  if (p === null || w === null) return null;
  if (w === 0n) return 0;
  return Number(((p > w ? w : p) * 10000n + w / 2n) / w) / 100;
}

export function formatBytes(input: U64): string {
  const value = valueOf(input);
  if (value === null) return '—';
  if (value === 0n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let unit = 0,
    scale = 1n;
  while (unit < units.length - 1 && value >= scale * 1000n) {
    unit++;
    scale *= 1000n;
  }
  const tenths = (value * 10n + scale / 2n) / scale;
  const text = unit > 0 && value < scale * 10n && tenths % 10n !== 0n ? `${tenths / 10n}.${tenths % 10n}` : String((value + scale / 2n) / scale);
  return `${text} ${units[unit]}`;
}

export function formatRate(input: U64): string {
  const text = formatBytes(input);
  return text === '—' ? text : text + '/s';
}

/** Round displayed milliseconds to 0.1 below 10 ms and whole milliseconds otherwise. */
export const millis = (value: number): number => (value < 10 ? Math.round(value * 10) / 10 : Math.round(value));
