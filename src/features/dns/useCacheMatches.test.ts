import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type * as React from 'react';
import {dnsCache} from '../../../mock/fixtures';
import {hookHarness} from '../../store/testHelpers';
import {useCacheMatches} from './useCacheMatches';

vi.mock('react', async original => ({
  ...(await original<typeof React>()),
  ...hookHarness.hooks,
  useMemo<T>(read: () => T, deps: unknown[]) {
    const ref = hookHarness.hooks.useRef<{value: T; deps: unknown[]} | null>(null);
    if (!ref.current || deps.some((value, index) => !Object.is(value, ref.current?.deps[index]))) ref.current = {value: read(), deps};
    return ref.current.value;
  }
}));

class MatchWorker {
  static current: MatchWorker;
  onmessage?: (event: {data: 'ready' | number[] | null}) => void;
  onerror?: (event: {preventDefault: () => void}) => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    MatchWorker.current = this;
  }
  emit(data: 'ready' | number[] | null) {
    this.onmessage?.({data});
  }
}
const entries = dnsCache.entries.slice(0, 2);
const pattern = {kind: 'regex' as const, text: '^example\\.com$'};
const read = () => hookHarness.render(() => useCacheMatches(entries, pattern, 'all'));

beforeEach(() => {
  hookHarness.reset();
  vi.useFakeTimers();
  vi.stubGlobal('Worker', MatchWorker);
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  hookHarness.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits for worker loading before allowing a full second for regex execution', () => {
  read();
  hookHarness.runEffects();
  const worker = MatchWorker.current;
  vi.advanceTimersByTime(1500);
  expect(read()).toMatchObject({pending: true, error: undefined, matches: []});
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.emit('ready');
  vi.advanceTimersByTime(999);
  expect(read()).toMatchObject({pending: true, error: undefined});
  vi.advanceTimersByTime(1);
  expect(read()).toMatchObject({pending: false, error: 'dns.regexTimeout', matches: []});
  expect(worker.terminate).toHaveBeenCalledOnce();
  worker.emit([0]);
  expect(read()).toMatchObject({error: 'dns.regexTimeout', matches: []});
});

it.each([false, true])('cancels a worker on unmount with readiness %s and ignores late messages', ready => {
  read();
  hookHarness.runEffects();
  const worker = MatchWorker.current;
  if (ready) worker.emit('ready');
  hookHarness.unmount();
  worker.emit('ready');
  worker.emit([0]);
  vi.advanceTimersByTime(2000);
  expect(read()).toMatchObject({pending: true, error: undefined, matches: []});
  expect(worker.terminate).toHaveBeenCalledOnce();
});
