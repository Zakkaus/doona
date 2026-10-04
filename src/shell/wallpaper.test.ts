import {afterEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_DIM, loadWallpaper, setWallpaper, wallpaperState} from './wallpaper';

type Handler = (() => void) | null;
type FakeRequest = {result?: unknown; error?: DOMException | null; onsuccess?: Handler; onerror?: Handler; onupgradeneeded?: Handler};

// An in-memory IndexedDB whose events fire on later tasks, in order; `hold` keeps them back until `release`.
function fakeIndexedDB({openError = false, abort = false, refuseBlob = false} = {}) {
  const records = new Map<string, unknown>();
  const held: Array<() => void> = [];
  let holding = false;
  let created = false;
  const fake = {records, upgrades: 0, hold: () => void (holding = true), release: () => ((holding = false), held.splice(0).forEach(later))};
  function later(event: () => void) {
    if (holding) held.push(event);
    else setTimeout(event);
  }
  const db = {
    createObjectStore: () => ((created = true), fake.upgrades++),
    close: () => undefined,
    transaction() {
      const tx: {error: DOMException | null; oncomplete?: Handler; onerror?: Handler; onabort?: Handler} = {error: null};
      const finish = (failure: DOMException | null) =>
        later(() => {
          tx.error = failure;
          (failure ? tx.onabort : tx.oncomplete)?.();
        });
      const request = (run: () => unknown): FakeRequest => {
        const req: FakeRequest = {};
        later(() => {
          const failure = abort ? new DOMException('aborted', 'AbortError') : null;
          if (!failure) req.result = run();
          finish(failure);
        });
        return req;
      };
      return Object.assign(tx, {
        objectStore: () => ({
          get: (key: string) => request(() => records.get(key)),
          delete: (key: string) => request(() => records.delete(key)),
          put(value: {image: unknown}, key: string) {
            if (refuseBlob && value.image instanceof Blob) {
              finish(new DOMException('no Blob here', 'UnknownError'));
              return {};
            }
            return request(() => records.set(key, value));
          }
        })
      });
    }
  };
  vi.stubGlobal('indexedDB', {
    open() {
      const req: FakeRequest = {};
      later(() => {
        if (openError) {
          req.error = new DOMException('denied', 'UnknownError');
          return req.onerror?.();
        }
        req.result = db;
        if (!created) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  });
  return fake;
}

const picture = (text = 'x') => ({image: new Blob([text], {type: 'image/webp'}), veil: false, dim: 0.4});

describe('wallpaper storage', () => {
  afterEach(async () => {
    await setWallpaper(null, false);
    vi.unstubAllGlobals();
  });

  it.each([
    ['is missing', undefined],
    [
      'throws',
      {
        open: () => {
          throw new DOMException('denied', 'SecurityError');
        }
      }
    ]
  ])('keeps the wallpaper for the session when IndexedDB %s', async (_, indexedDB) => {
    vi.stubGlobal('indexedDB', indexedDB);
    await expect(loadWallpaper()).resolves.toBeUndefined();
    const wallpaper = {image: new Blob(['x'], {type: 'image/webp'}), veil: true, dim: DEFAULT_DIM};
    await expect(setWallpaper(wallpaper)).resolves.toBe(false);
    expect(wallpaperState()).toMatchObject({wallpaper, stored: false});
    expect(wallpaperState().url).toMatch(/^blob:/);
  });

  // Each save runs against a fresh database (one upgrade), then a restart reads back what was kept.
  it.each([
    ['keeps the Blob', {}, true, 'blob'],
    ['keeps the bytes when the Blob is refused', {refuseBlob: true}, true, 'bytes'],
    ['keeps it for the session when opening fails later', {openError: true}, false, null],
    ['keeps it for the session when the transaction aborts', {abort: true}, false, null]
  ] as const)('%s', async (_, options, stored, kept) => {
    const fake = fakeIndexedDB(options);
    const wallpaper = picture('restored');
    await expect(setWallpaper(wallpaper)).resolves.toBe(stored);
    expect(wallpaperState()).toMatchObject({wallpaper, stored});
    expect(fake.upgrades).toBe('openError' in options ? 0 : 1);
    const record = fake.records.get('current') as {image: unknown} | undefined;
    expect(record && (record.image instanceof Blob ? 'blob' : 'bytes')).toBe(kept ?? undefined);
    await setWallpaper(null, false);
    await loadWallpaper();
    const restored = wallpaperState().wallpaper;
    if (!kept) return expect(restored).toBeNull();
    expect(restored).toMatchObject({veil: false, dim: 0.4});
    expect(restored!.image.type).toBe('image/webp');
    expect(await restored!.image.text()).toBe('restored');
  });

  it('does not write a retried save back after a later reset', async () => {
    const fake = fakeIndexedDB({refuseBlob: true});
    const wallpaper = picture();
    let bytes!: (value: ArrayBuffer) => void;
    const reading = vi.fn(() => new Promise<ArrayBuffer>(resolve => (bytes = resolve)));
    wallpaper.image.arrayBuffer = reading;
    const save = setWallpaper(wallpaper);
    await vi.waitFor(() => expect(reading).toHaveBeenCalled());
    const reset = setWallpaper(null);
    bytes(new ArrayBuffer(1));
    await Promise.all([save, reset]);
    expect(fake.records.has('current')).toBe(false);
    expect(wallpaperState().wallpaper).toBeNull();
  });

  it('drops a startup read that a pick and a reset overtook', async () => {
    const fake = fakeIndexedDB();
    fake.records.set('current', picture('old'));
    fake.hold();
    const load = loadWallpaper();
    const changes = [setWallpaper(picture('new')), setWallpaper(null)];
    fake.release();
    await Promise.all([load, ...changes]);
    expect(wallpaperState().wallpaper).toBeNull();
    expect(fake.records.has('current')).toBe(false);
  });

  it('keeps the object URL for a veil change and releases it for a new image', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const image = new Blob(['a']);
    await setWallpaper({image, veil: true, dim: 0.3});
    const url = wallpaperState().url;
    await setWallpaper({image, veil: false, dim: 0.3});
    expect(wallpaperState().url).toBe(url);
    expect(revoke).not.toHaveBeenCalled();
    await setWallpaper(null);
    expect(revoke).toHaveBeenCalledWith(url);
    expect(wallpaperState().url).toBeNull();
  });
});
