import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// A one-component stand-in for React: hook slots persist across `render` calls, and callbacks and layout effects
// follow their dependency lists, which is all `useNearViewport` needs.
const slots: Array<{value?: unknown; deps?: unknown[]}> = [];
let slot = 0;
const same = (a: unknown[] | undefined, b: unknown[]) => a !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
vi.mock('react', () => ({
  useState<T>(initial: T) {
    const s = (slots[slot++] ??= {value: initial});
    return [s.value, (next: T) => (s.value = next)];
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

const {useNearViewport} = await import('./hooks');
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
