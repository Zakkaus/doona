import {describe, expect, it} from 'vitest';
import {addU64, parseU64, pctU64} from './u64';
import {formatBytes, formatRate} from '../i18n/format';

describe('UInt64 counters', () => {
  it('preserves exact counters and carries above 2^53', () => {
    expect(parseU64('9007199254740993')).toBe(9007199254740993n);
    expect(parseU64('18446744073709551615')).toBe(18446744073709551615n);
    expect(addU64('9007199254740993', '2')).toBe(9007199254740995n);
    expect(addU64('18446744073709551615', '1')).toBe(18446744073709551616n);
    expect(pctU64('9007199254740993', '18014398509481986')).toBe(50);
  });
  it('keeps unknown separate from zero', () => {
    expect(parseU64(null)).toBeNull();
    expect(parseU64('0')).toBe(0n);
    expect(formatBytes(null, 'en')).toBe('—');
    expect(formatRate(null, 'en')).toBe('—');
    expect(formatBytes('0', 'en')).toBe('0 B');
    expect(addU64('10', null)).toBeNull();
    expect(pctU64(null, '10')).toBeNull();
    expect(pctU64('1', null)).toBeNull();
    expect(pctU64('0', '0')).toBe(0);
  });
  it('formats decimal units without floating-point counters', () => {
    expect(formatBytes('1100000000', 'en')).toBe('1.1 GB');
    expect(formatRate('3400000', 'en')).toBe('3.4 MB/s');
    expect(formatRate('257000', 'en')).toBe('257 KB/s');
    expect(formatBytes('9007199254740993', 'en')).toBe('9 PB');
    expect(formatBytes('18446744073709551615', 'en')).toBe('18 EB');
    expect(formatBytes(9999500000000000n, 'en')).toBe('10 PB');
  });
  it.each(['-1', '01', '', '1.5', '1e3', '18446744073709551616'])('rejects noncanonical or out-of-range counter %s', value => {
    expect(parseU64(value)).toBeNull();
  });
  it('renders malformed counters as unknown and propagates them through aggregates', () => {
    expect(formatBytes('broken', 'en')).toBe('—');
    expect(formatRate('broken', 'en')).toBe('—');
    expect(addU64('1', 'broken')).toBeNull();
    expect(pctU64('broken', '10')).toBeNull();
  });
});
