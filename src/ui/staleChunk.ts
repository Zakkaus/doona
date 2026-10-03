// A tab that outlives a deploy asks for chunk files whose hashes no longer exist. The browsers word that failure
// differently: Chromium, Firefox and Safari in turn, then Vite's own message for a stylesheet it could not preload.
const CHUNK_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CHUNK_FAILURE.test(message);
}

const GUARD_KEY = 'doona-stale-reload';
const RELOAD_GUARD_MS = 30_000;
// Reloads the page once for a stale chunk and reports whether it asked for one. A reload within the last
// RELOAD_GUARD_MS is not repeated, and neither is one whose time cannot be kept: a chunk that is truly missing
// would otherwise reload forever.
export function reloadForStaleChunk(reload: () => void = () => location.reload(), now = Date.now(), storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  try {
    const store = storage ?? sessionStorage;
    const last = Number(store.getItem(GUARD_KEY));
    if (Math.abs(now - last) < RELOAD_GUARD_MS) return false;
    store.setItem(GUARD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
