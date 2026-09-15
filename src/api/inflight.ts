import type {Api} from './api';
import type {ResourceName} from './invalidation';

export type ResourceKey = readonly [ResourceName, Readonly<Record<string, string | number | boolean | null | undefined>>?];

export function normalizeResourceKey([resource, query]: ResourceKey): string {
  return JSON.stringify([
    resource,
    Object.entries(query ?? {})
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  ]);
}

type Entry<T> = {promise: Promise<T>; controller: AbortController; consumers: number; settled: boolean};
export type RequestLease<T> = {promise: Promise<T>; release: () => void};

export class InflightRegistry {
  private readonly requests = new WeakMap<Api, Map<string, Entry<unknown>>>();

  // Each key must describe the same response type and query for every consumer.
  acquire<T>(api: Api, key: string, fetch: (signal: AbortSignal) => Promise<T>): RequestLease<T> {
    let entries = this.requests.get(api);
    if (!entries) {
      entries = new Map();
      this.requests.set(api, entries);
    }
    let entry = entries.get(key) as Entry<T> | undefined;
    if (!entry) {
      const controller = new AbortController();
      const created: Entry<T> = {
        controller,
        consumers: 0,
        settled: false,
        promise: Promise.resolve()
          .then(() => fetch(controller.signal))
          .finally(() => {
            created.settled = true;
            if (entries.get(key) === created) entries.delete(key);
          })
      };
      entries.set(key, created);
      entry = created;
    }
    const shared = entry;
    shared.consumers++;
    let released = false;
    return {
      promise: shared.promise,
      release() {
        if (released) return;
        released = true;
        if (--shared.consumers === 0 && !shared.settled) {
          if (entries.get(key) === shared) entries.delete(key);
          shared.controller.abort();
        }
      }
    };
  }
}

export const inflight = new InflightRegistry();
