import {describe, expect, it} from 'vitest';
import {durationMs} from './motion';

describe('durationMs', () => {
  it('reads milliseconds and the seconds a minifier writes', () => {
    expect(durationMs('1000ms', 0)).toBe(1000);
    expect(durationMs('1s', 0)).toBe(1000);
    expect(durationMs('.6s', 0)).toBe(600);
  });
  it('falls back when the token is missing', () => {
    expect(durationMs('', 1000)).toBe(1000);
  });
});
