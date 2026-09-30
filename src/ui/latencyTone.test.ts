import {expect, it} from 'vitest';
import {latencyTone} from './Tile';

it('is green below 100 ms, yellow from 100 to 299 ms and red from 300 ms', () => {
  expect(latencyTone(0)).toBe('ok');
  expect(latencyTone(99)).toBe('ok');
  expect(latencyTone(100)).toBe('warn');
  expect(latencyTone(299)).toBe('warn');
  expect(latencyTone(300)).toBe('err');
  expect(latencyTone(5000)).toBe('err');
});
