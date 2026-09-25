import {afterEach, expect, it} from 'vitest';
import {noteServerTime, resetServerClock, serverNow} from './serverClock';

const at = (ms: number) => new Date(ms).toISOString();
const local = Date.parse('2026-09-25T10:00:00Z');
afterEach(resetServerClock);

it('follows the browser clock until a response says otherwise', () => {
  expect(serverNow(local)).toBe(local);
  noteServerTime(undefined, local);
  noteServerTime('not a time', local);
  expect(serverNow(local)).toBe(local);
});

it('ignores a skew of a few seconds', () => {
  noteServerTime(at(local - 3000), local);
  expect(serverNow(local)).toBe(local);
});

it('shifts to a host clock that is minutes behind or ahead', () => {
  noteServerTime(at(local - 600_000), local);
  expect(serverNow(local)).toBe(local - 600_000);
  resetServerClock();
  noteServerTime(at(local + 120_000), local);
  expect(serverNow(local + 1000)).toBe(local + 121_000);
});

it('takes the freshest reading, since a retained snapshot only looks older', () => {
  noteServerTime(at(local - 600_000), local);
  noteServerTime(at(local - 630_000), local + 1000);
  expect(serverNow(local + 1000)).toBe(local - 599_000);
});

it('forgets old readings, so a host clock corrected by NTP is followed', () => {
  noteServerTime(at(local + 120_000), local);
  noteServerTime(at(local + 120_000), local + 120_000);
  expect(serverNow(local + 120_000)).toBe(local + 120_000);
});

it('keeps the last estimate while no response arrives', () => {
  noteServerTime(at(local - 600_000), local);
  expect(serverNow(local + 300_000)).toBe(local - 300_000);
});
