import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {joinWait, overdue} from './waitClock';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('shows a wait after 150ms and not before', () => {
  const show = vi.fn();
  const leave = joinWait('one', show);
  vi.advanceTimersByTime(149);
  expect(show).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(show).toHaveBeenCalledOnce();
  leave();
});

it('lets the next phase show at once while the wait runs or within 100ms of its end', () => {
  const first = joinWait('two', vi.fn());
  vi.advanceTimersByTime(200);
  expect(overdue('two')).toBe(true);
  first();
  vi.advanceTimersByTime(99);
  const next = vi.fn();
  const second = joinWait('two', next);
  vi.advanceTimersByTime(0);
  expect(next).toHaveBeenCalledOnce();
  second();
});

it('starts a new delay once nothing has waited for 100ms, for a caller that waits again', () => {
  joinWait('three', vi.fn())();
  vi.advanceTimersByTime(300);
  vi.advanceTimersByTime(100);
  expect(overdue('three')).toBe(false);
  const show = vi.fn();
  const leave = joinWait('three', show);
  vi.advanceTimersByTime(149);
  expect(show).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(show).toHaveBeenCalledOnce();
  leave();
});

it('keeps the clock of one route from another route or a widget', () => {
  const page = joinWait('rules', vi.fn());
  vi.advanceTimersByTime(300);
  expect(overdue('rules')).toBe(true);
  expect(overdue('dns')).toBe(false);
  const show = vi.fn();
  const next = joinWait('dns', show);
  vi.advanceTimersByTime(149);
  expect(show).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(show).toHaveBeenCalledOnce();
  page();
  next();
});
