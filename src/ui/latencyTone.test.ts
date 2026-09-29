import {expect, it} from 'vitest';
import {latencyTone} from './Tile';

it('keeps a latency in body text below 600 ms and marks it slow from there, never red', () => {
  expect(latencyTone(0)).toBeUndefined();
  expect(latencyTone(599)).toBeUndefined();
  expect(latencyTone(600)).toBe('warn');
  expect(latencyTone(5000)).toBe('warn');
});
