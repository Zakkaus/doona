import {afterEach, expect, it} from 'vitest';
import {createServerClock, serverNow, selectServerClock} from './serverClock';

const at = (ms: number) => new Date(ms).toISOString();
const local = Date.parse('2026-09-25T10:00:00Z');
afterEach(() => selectServerClock(createServerClock()));

it('follows the browser clock until a response says otherwise', () => {
  const clock = createServerClock();
  expect(clock.now(local)).toBe(local);
  clock.note(undefined, local);
  clock.note('not a time', local);
  expect(clock.now(local)).toBe(local);
});

it('ignores a skew of a few seconds', () => {
  const clock = createServerClock();
  clock.note(at(local - 3000), local);
  expect(clock.now(local)).toBe(local);
});

it('shifts to a host clock that is minutes behind or ahead', () => {
  const behind = createServerClock();
  behind.note(at(local - 600_000), local);
  expect(behind.now(local)).toBe(local - 600_000);
  const ahead = createServerClock();
  ahead.note(at(local + 120_000), local);
  expect(ahead.now(local + 1000)).toBe(local + 121_000);
});

it('keeps a shift until the skew falls below half the tolerance, so it does not flap', () => {
  const clock = createServerClock();
  clock.note(at(local - 5500), local);
  expect(clock.now(local)).toBe(local - 5500);
  clock.note(at(local + 60_000 - 4500), local + 60_000);
  expect(clock.now(local + 60_000)).toBe(local + 60_000 - 4500);
  clock.note(at(local + 120_000 - 2000), local + 120_000);
  expect(clock.now(local + 120_000)).toBe(local + 120_000);
  clock.note(at(local + 180_000 - 4500), local + 180_000);
  expect(clock.now(local + 180_000)).toBe(local + 180_000);
});

it('takes the freshest reading, since a retained snapshot only looks older', () => {
  const clock = createServerClock();
  clock.note(at(local - 600_000), local);
  clock.note(at(local - 630_000), local + 1000);
  expect(clock.now(local + 1000)).toBe(local - 599_000);
});

it('forgets old readings, so a host clock corrected by NTP is followed', () => {
  const clock = createServerClock();
  clock.note(at(local + 120_000), local);
  clock.note(at(local + 120_000), local + 120_000);
  expect(clock.now(local + 120_000)).toBe(local + 120_000);
});

it('keeps the last estimate while no response arrives', () => {
  const clock = createServerClock();
  clock.note(at(local - 600_000), local);
  expect(clock.now(local + 300_000)).toBe(local - 300_000);
});

it('reads relative times on the active backend clock only', () => {
  const previous = createServerClock();
  const current = createServerClock();
  selectServerClock(current);
  previous.note(at(local - 600_000), local);
  expect(serverNow(local)).toBe(local);
  current.note(at(local + 120_000), local);
  expect(serverNow(local)).toBe(local + 120_000);
});
