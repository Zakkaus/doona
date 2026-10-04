import {useSyncExternalStore} from 'react';

// A custom wallpaper for the Glass palettes, kept only in this browser: one IndexedDB record holds the image as a Blob
// with its veil settings, and nothing reaches localStorage or the backend. The record is read once at startup and
// handed to the stylesheet as --rp-wall-image, --rp-veil-alpha and data-wallpaper on the root; glass.css draws it. When
// storage fails, the wallpaper lasts for this session only and the snapshot says so.
export type Wallpaper = {image: Blob; veil: boolean; dim: number};
export type WallpaperState = {wallpaper: Wallpaper | null; url: string | null; stored: boolean};

// The veil's strength runs up to 60%. At 60% label and secondary text keep 4.5:1 on every Glass surface over a pure
// white or a pure black image (e2e/wallpaper.spec.ts measures it), so that is also the default.
export const MAX_DIM = 0.6;
export const DEFAULT_DIM = 0.6;

const DB = 'doona-wallpaper';
const STORE = 'wallpaper';
const KEY = 'current';

let state: WallpaperState = {wallpaper: null, url: null, stored: true};
const listeners = new Set<() => void>();

// Storage runs one operation at a time in the order they were asked for, so a save's retry finishes before a later
// delete starts. Every change bumps the generation; a read or a save whose generation is no longer current does not
// touch the state.
let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(operation);
  queue = run.catch(() => undefined);
  return run;
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? request.error);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

// WebKit's private sessions cannot store a Blob in IndexedDB, so a failed save keeps the image's bytes instead.
type Stored = Omit<Wallpaper, 'image'> & {image: Blob | {bytes: ArrayBuffer; type: string}};
function fromStored(value: unknown): Wallpaper | null {
  if (typeof value !== 'object' || value === null) return null;
  const {image, veil, dim} = value as Partial<Stored>;
  if (typeof veil !== 'boolean' || typeof dim !== 'number' || dim < 0 || dim > MAX_DIM) return null;
  if (image instanceof Blob) return {image, veil, dim};
  if (image && image.bytes instanceof ArrayBuffer && typeof image.type === 'string') return {image: new Blob([image.bytes], {type: image.type}), veil, dim};
  return null;
}
const put = (value: Stored) => withStore('readwrite', store => store.put(value, KEY) as IDBRequest);

// A new image gets a new object URL and the old one is released; a veil change keeps the URL.
function apply(wallpaper: Wallpaper | null, stored: boolean) {
  let url = state.url;
  if (state.wallpaper?.image !== wallpaper?.image) {
    if (url) URL.revokeObjectURL(url);
    url = wallpaper ? URL.createObjectURL(wallpaper.image) : null;
  }
  state = {wallpaper, url, stored};
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (wallpaper && url) {
      root.style.setProperty('--rp-wall-image', `url("${url}")`);
      root.style.setProperty('--rp-veil-alpha', String(wallpaper.dim));
      root.dataset.wallpaper = wallpaper.veil ? 'veil' : 'plain';
    } else {
      root.style.removeProperty('--rp-wall-image');
      root.style.removeProperty('--rp-veil-alpha');
      delete root.dataset.wallpaper;
    }
  }
  listeners.forEach(listener => listener());
}

// Startup: show the stored wallpaper, if any. A browser without storage simply starts with the default.
export async function loadWallpaper(): Promise<void> {
  const current = generation;
  try {
    const wallpaper = fromStored(await enqueue(() => withStore('readonly', store => store.get(KEY))));
    if (wallpaper && current === generation) apply(wallpaper, true);
  } catch {
    // No storage: the default wallpaper stays.
  }
}

// Shows the wallpaper at once (null restores the default) and, unless `store` is false, saves it; resolves to whether
// it was saved. A failed save keeps it for this session.
export async function setWallpaper(wallpaper: Wallpaper | null, store = true): Promise<boolean> {
  const current = ++generation;
  apply(wallpaper, state.stored);
  if (!store) return state.stored;
  const stored = await enqueue(async () => {
    if (!wallpaper) await withStore('readwrite', store => store.delete(KEY));
    else await put(wallpaper).catch(async () => put({...wallpaper, image: {bytes: await wallpaper.image.arrayBuffer(), type: wallpaper.image.type}}));
  }).then(
    () => true,
    () => false
  );
  if (current === generation) apply(wallpaper, stored);
  return stored;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const wallpaperState = () => state;
export function useWallpaper(): WallpaperState {
  return useSyncExternalStore(subscribe, wallpaperState);
}
