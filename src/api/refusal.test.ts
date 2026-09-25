import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {currentRefusal, subscribeRefusal, waitOutRefusal} from './refusal';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it('publishes a refusal wait longer than a few seconds until it ends, and a short one not at all', async () => {
  const notify = vi.fn();
  const stop = subscribeRefusal(notify);
  const short = waitOutRefusal(503, 3);
  expect(currentRefusal()).toBeNull();
  await vi.advanceTimersByTimeAsync(3000);
  await short;
  expect(notify).not.toHaveBeenCalled();
  const start = Date.now();
  const long = waitOutRefusal(429, 10);
  const longer = waitOutRefusal(503, 20);
  // The wait that ends last is the one shown.
  expect(currentRefusal()).toEqual({status: 503, until: start + 20000});
  await vi.advanceTimersByTimeAsync(10000);
  await long;
  expect(currentRefusal()).toEqual({status: 503, until: start + 20000});
  await vi.advanceTimersByTimeAsync(10000);
  await longer;
  expect(currentRefusal()).toBeNull();
  expect(notify).toHaveBeenCalledTimes(4);
  stop();
});

it('clears an aborted wait', async () => {
  const controller = new AbortController();
  const waiting = waitOutRefusal(429, 30, controller.signal);
  expect(currentRefusal()).not.toBeNull();
  controller.abort();
  await expect(waiting).rejects.toThrow();
  expect(currentRefusal()).toBeNull();
});
