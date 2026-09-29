import {beforeEach, describe, expect, it, vi} from 'vitest';

const store = (initial?: string) => {
  const values = new Map<string, string>(initial === undefined ? [] : [['doona-stale-reload', initial]]);
  return {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value)};
};

// The in-flight flag is module state, so each case starts from a fresh module.
let staleChunk: typeof import('./staleChunk');
beforeEach(async () => {
  vi.resetModules();
  staleChunk = await import('./staleChunk');
});

describe('isChunkLoadError', () => {
  it.each([
    ['Chromium', 'Failed to fetch dynamically imported module: http://x/assets/Config-3EIbnCtN.js'],
    ['Firefox', 'error loading dynamically imported module: http://x/assets/Config-3EIbnCtN.js'],
    ['Safari', 'Importing a module script failed.'],
    ['Vite stylesheet', 'Unable to preload CSS for /assets/Config-abc.css']
  ])('matches the %s message', (_browser, message) => {
    expect(staleChunk.isChunkLoadError(new TypeError(message))).toBe(true);
    expect(staleChunk.isChunkLoadError(message)).toBe(true);
  });

  it('leaves other errors alone', () => {
    expect(staleChunk.isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(staleChunk.isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(staleChunk.isChunkLoadError(undefined)).toBe(false);
    expect(staleChunk.isChunkLoadError({message: 'Failed to fetch dynamically imported module'})).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  it('reloads once and records the time', () => {
    const reload = vi.fn();
    const storage = store();
    expect(staleChunk.reloadForStaleChunk(reload, 1_000_000, storage)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem('doona-stale-reload')).toBe('1000000');
  });

  it('reports a reload that is under way without repeating it', () => {
    const reload = vi.fn();
    const storage = store();
    staleChunk.reloadForStaleChunk(reload, 1_000_000, storage);
    expect(staleChunk.reloadForStaleChunk(reload, 1_000_500, storage)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again within 30 seconds of the last one', () => {
    const reload = vi.fn();
    expect(staleChunk.reloadForStaleChunk(reload, 1_029_999, store('1000000'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once 30 seconds have passed', () => {
    const reload = vi.fn();
    expect(staleChunk.reloadForStaleChunk(reload, 1_030_000, store('1000000'))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('treats a time in the future as recent, so a clock change cannot loop it', () => {
    const reload = vi.fn();
    expect(staleChunk.reloadForStaleChunk(reload, 1_000_000, store('1010000'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when storage cannot keep the time', () => {
    const reload = vi.fn();
    const denied = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => undefined
    };
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      }
    };
    expect(staleChunk.reloadForStaleChunk(reload, 1_000_000, denied)).toBe(false);
    expect(staleChunk.reloadForStaleChunk(reload, 1_000_000, full)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when reading sessionStorage throws', () => {
    const reload = vi.fn();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      }
    });
    try {
      expect(staleChunk.reloadForStaleChunk(reload, 1_000_000)).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
      else Reflect.deleteProperty(globalThis, 'sessionStorage');
    }
    expect(reload).not.toHaveBeenCalled();
  });
});
