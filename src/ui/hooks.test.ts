import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// A one-component stand-in for React: hook slots persist across `render` calls, and callbacks and layout effects
// follow their dependency lists, which is all `useNearViewport` needs.
const slots: Array<{value?: unknown; deps?: unknown[]}> = [];
let slot = 0;
const same = (a: unknown[] | undefined, b: unknown[]) => a !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
vi.mock('react', () => ({
  useState<T>(initial: T) {
    const s = (slots[slot++] ??= {value: initial});
    return [s.value, (next: T | ((previous: T) => T)) => (s.value = typeof next === 'function' ? (next as (previous: T) => T)(s.value as T) : next)];
  },
  useRef<T>(initial: T) {
    return (slots[slot++] ??= {value: {current: initial}}).value as {current: T};
  },
  useCallback<T>(fn: T, deps: unknown[]) {
    const s = (slots[slot++] ??= {});
    if (!same(s.deps, deps)) Object.assign(s, {value: fn, deps});
    return s.value as T;
  },
  useLayoutEffect(fn: () => void, deps: unknown[]) {
    const s = (slots[slot++] ??= {});
    if (!same(s.deps, deps)) {
      s.deps = deps;
      fn();
    }
  },
  useEffect() {}
}));
vi.mock('react-dom', () => ({flushSync: (fn: () => void) => fn()}));

const {useContentSize, useNearViewport} = await import('./hooks');
const rewind = () => {
  slot = 0;
};
// Each call is one render of the same component.
const useRender = (onNear: () => void) => {
  rewind();
  return useNearViewport(onNear);
};

describe('useNearViewport', () => {
  const observers: Array<(entries: Array<{isIntersecting: boolean}>) => void> = [];
  beforeEach(() => {
    slots.length = 0;
    observers.length = 0;
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(report: (entries: Array<{isIntersecting: boolean}>) => void) {
          observers.push(report);
        }
        observe() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps one observer for an inline onNear and calls the latest one', () => {
    const first = vi.fn();
    const [ref] = useRender(first);
    ref({getBoundingClientRect: () => ({top: 0, bottom: 100})} as unknown as HTMLElement);
    expect(first).toHaveBeenCalledTimes(1);
    const second = vi.fn();
    // The same ref means React keeps the element attached and builds no second observer.
    expect(useRender(second)[0]).toBe(ref);
    observers[0]([{isIntersecting: true}]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(observers).toHaveLength(1);
  });
});

describe('useContentSize', () => {
  type Report = (entries: Array<{contentRect: {width: number; height: number}}>) => void;
  const reports: Report[] = [];
  beforeEach(() => {
    slots.length = 0;
    reports.length = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(report: Report) {
          reports.push(report);
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('getComputedStyle', () => ({paddingLeft: '0px', paddingRight: '0px', paddingTop: '4px', paddingBottom: '4px'}));
  });
  afterEach(() => vi.unstubAllGlobals());

  // A zoomed grid whose content box is 988.797px wide: clientWidth rounds it to 989, where contentRect keeps the
  // fraction and the size floors it to 988. A table fitting its columns to the two dropped a column after first paint.
  it('reads the first size and every resize the same way', () => {
    const el = {clientWidth: 989, clientHeight: 608, getBoundingClientRect: () => ({width: 1246, height: 760}), getClientRects: () => [{}]};
    // The ref is the hook's first slot; the element is attached before the layout effect runs, as React does.
    slots[0] = {value: {current: el}};
    const sizes: unknown[] = [];
    const useRenderSize = () => {
      rewind();
      sizes.push(useContentSize()[1]);
    };
    useRenderSize();
    // The render the layout effect's own update causes, before the observer reports the same layout.
    useRenderSize();
    reports[0]([{contentRect: {width: 988.796875, height: 600}}]);
    useRenderSize();
    expect(sizes).toEqual([null, {width: 989, height: 600}, {width: 989, height: 600}]);
    // An unchanged layout keeps the same object, so nothing re-renders.
    expect(sizes[2]).toBe(sizes[1]);
  });

  it('keeps the last size while the element is hidden', () => {
    let shown = true;
    const el = {clientWidth: 400, clientHeight: 200, getBoundingClientRect: () => ({width: 400, height: 200}), getClientRects: () => (shown ? [{}] : [])};
    slots[0] = {value: {current: el}};
    const useRenderSize = () => {
      rewind();
      return useContentSize()[1];
    };
    useRenderSize();
    shown = false;
    Object.assign(el, {clientWidth: 0, clientHeight: 0});
    reports[0]([{contentRect: {width: 0, height: 0}}]);
    expect(useRenderSize()).toEqual({width: 400, height: 192});
  });
});
