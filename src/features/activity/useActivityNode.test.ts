import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {Node} from '../../api/model';
import type {Api} from '../../api/api';
import type * as React from 'react';
import {stubVisibleDocument} from '../../store/testHelpers';

const hooks = vi.hoisted(() => ({
  index: 0,
  preview: false,
  slots: [] as Array<{value?: unknown; deps?: unknown[]; cleanup?: () => void}>,
  effects: [] as Array<() => void>
}));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof React>();
  const memo = (make: () => unknown, deps: unknown[]) => {
    const slot = (hooks.slots[hooks.index++] ??= {});
    if (!slot.deps || deps.some((value, i) => value !== slot.deps![i])) {
      slot.value = make();
      slot.deps = deps;
    }
    return slot.value;
  };
  return {
    ...original,
    useContext: () => hooks.preview,
    useRef: (value: unknown) => memo(() => ({current: value}), []),
    useCallback: (value: unknown, deps: unknown[]) => memo(() => value, deps),
    useMemo: memo,
    useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
      const slot = (hooks.slots[hooks.index++] ??= {});
      if (!slot.deps || deps.some((value, i) => value !== slot.deps![i])) {
        hooks.effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect() ?? undefined;
        });
        slot.deps = deps;
      }
    },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot()
  };
});
import {useLatencySpark} from './useActivityNode';
import {clearRing, record, resetRings} from '../../store/rings';
import {foldCpu, type CpuSample} from '../shared/widgetSeries';
import {watchResource, type RefreshOutcome} from '../../store/resourceCore';

let storage: Record<string, string>;
const node = {id: 'n', health: [{transport: 'tcp', purpose: 'data', state: 'healthy', latency_ms: 40}]} as Node;
const at = (latency: number) => ({...node, health: node.health.map(row => ({...row, latency_ms: latency}))});
const key = JSON.stringify(['g', 'n']);
const ringOf = (selected: string) => `latency-${encodeURIComponent(selected)}`;
const name = ringOf(key);
const values = (ring = name) => record<CpuSample>(ring, undefined, foldCpu).fine.map(sample => sample.value);
const ok: RefreshOutcome = {key: 'nodes', ok: true};
const idle = vi.fn(async (): Promise<RefreshOutcome> => ok);
const disposers: Array<() => void> = [];
function useSpark(nodes: Node[] | undefined, selected = key, enabled = true, refetch: () => Promise<RefreshOutcome> | undefined = idle, id = node.id) {
  // eslint-disable-next-line react-hooks/immutability -- This harness resets mocked hook slots, not component state.
  hooks.index = 0;
  const result = useLatencySpark(nodes, id, selected, enabled, refetch);
  hooks.effects.splice(0).forEach(effect => effect());
  return result;
}
const unmount = () => {
  hooks.slots.forEach(slot => slot.cleanup?.());
  hooks.slots = [];
  hooks.effects = [];
};
beforeEach(() => {
  vi.useFakeTimers();
  stubVisibleDocument();
  storage = {};
  Object.defineProperties(storage, {
    getItem: {value: (key: string) => storage[key] ?? null},
    setItem: {value: (key: string, value: string) => void (storage[key] = value)},
    removeItem: {value: (key: string) => void delete storage[key]}
  });
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  unmount();
  hooks.preview = false;
  disposers.splice(0).forEach(dispose => dispose());
  resetRings();
  idle.mockClear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('keeps latency in a persisted ring for its group and node', async () => {
  const unavailable = () => undefined;
  useSpark([at(40)], key, true, unavailable);
  await vi.advanceTimersByTimeAsync(61000);
  useSpark([at(42)], key, true, unavailable);
  await vi.advanceTimersByTimeAsync(0);
  expect(Object.keys(storage).every(stored => stored.startsWith('doona-rings-latency-%5B%22g%22%2C%22n%22%5D-['))).toBe(true);
  expect(Object.keys(storage)).not.toEqual([]);
  // A fresh module reads what a new page would, not the old module's cache.
  vi.resetModules();
  const reopened = await import('../../store/rings');
  expect(reopened.record<CpuSample>(name, undefined, foldCpu).fine.map(sample => sample.value)).toEqual([40, 42]);
  expect(reopened.record<CpuSample>(ringOf(JSON.stringify(['other', 'n'])), undefined, foldCpu).fine).toEqual([]);
});

it('shows the stored line once the node list loads, without restarting it or reading early', async () => {
  record(name, {time: Date.now() - 5000, value: 38}, foldCpu);
  record(name, {time: Date.now() - 1000, value: 40}, foldCpu);
  useSpark(undefined, JSON.stringify(['g', '']), true, idle, '');
  const source = [at(41)];
  useSpark(source);
  expect(useSpark(source).values).toEqual([38, 40, 41]);
  // The same list drawn again, as when the card returns from the editor, is not a second reading.
  unmount();
  useSpark(source);
  expect(useSpark(source).values).toEqual([38, 40, 41]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(idle).not.toHaveBeenCalled();
});

it('previews read the ring without recording', () => {
  record(name, {time: Date.now() - 5000, value: 38}, foldCpu);
  record(name, {time: Date.now() - 1000, value: 40}, foldCpu);
  hooks.preview = true;
  expect(useSpark([at(41)]).values).toEqual([38, 40]);
  expect(values()).toEqual([38, 40]);
});

it('starts over on a selection change and clears when the line is switched off', async () => {
  const other = JSON.stringify(['other', 'n']);
  useSpark([at(40)]);
  useSpark([at(41)]);
  useSpark([at(42)], other);
  expect(values()).toEqual([]);
  expect(values(ringOf(other))).toEqual([42]);
  useSpark([at(42)], other, false);
  expect(values(ringOf(other))).toEqual([]);
  // Switched back on, the ring restarts from the next reading.
  useSpark([at(43)], other);
  expect(values(ringOf(other))).toEqual([43]);
  clearRing(ringOf(other));
  await vi.advanceTimersByTimeAsync(61000);
  expect(Object.keys(storage)).toEqual([]);
});

it('brings one inventory read forward an event gap after the list, leaving the poll at its interval', async () => {
  let latency = 40;
  const fetch = vi.fn(async () => [at(latency++)]);
  const watcher = watchResource({} as Api, {key: ['nodes'], every: 30000, fetch}, () => {});
  disposers.push(watcher.dispose);
  await vi.advanceTimersByTimeAsync(0);
  const refetch = async () => {
    const outcome = await watcher.refetch();
    // The read's publish renders the card before the caller hears back.
    // eslint-disable-next-line react-hooks/rules-of-hooks -- The harness renders the hook by hand, here as the publish would.
    useSpark(watcher.getSnapshot().data, key, true, refetch);
    return outcome;
  };
  useSpark(watcher.getSnapshot().data, key, true, refetch);
  await vi.advanceTimersByTimeAsync(4999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(values()).toEqual([40, 41]);
  await vi.advanceTimersByTimeAsync(29999);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('records the early read once when it returns the list unchanged', async () => {
  const source = [at(40)];
  useSpark(source);
  await vi.advanceTimersByTimeAsync(5000);
  // The unchanged reading is recorded after the render the read would have caused.
  await vi.advanceTimersByTimeAsync(1);
  expect(useSpark(source).values).toEqual([40, 40]);
  await vi.advanceTimersByTimeAsync(60000);
  expect(idle).toHaveBeenCalledOnce();
  expect(values()).toEqual([40, 40]);
});

it.each(['unmounted', 'disabled', 'preview', 'second sample'] as const)('cancels the early read when %s', async reason => {
  const source = [at(40)];
  useSpark(source);
  await vi.advanceTimersByTimeAsync(1000);
  if (reason === 'unmounted') unmount();
  else {
    if (reason === 'preview') hooks.preview = true;
    const next = reason === 'second sample' ? [at(41)] : source;
    useSpark(next, key, reason !== 'disabled');
    // The second render is the one a recorded sample causes.
    useSpark(next, key, reason !== 'disabled');
  }
  await vi.advanceTimersByTimeAsync(5000);
  expect(idle).not.toHaveBeenCalled();
});
