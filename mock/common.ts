import {ApiError} from '../src/api/error';
import {uuid} from '../src/api/hash';
import {normalizeResourceKey} from '../src/api/inflight';
import type {ResourceName} from '../src/api/invalidation';

// The shared Limit1000 page size: 100 rows unless the caller asks, and never more than 1000.
export function pageLimit(limit = 100): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new ApiError(400, 'invalid_request', 'Invalid page size');
  return limit;
}

// honk's cursor rules per resource (native_api/pages.rs for nodes and providers, observe/flows.rs, dns/cache.rs and
// dns/log.rs). `held` is how many snapshots stay at once. When full, `refuse` answers 503 and otherwise the oldest goes.
// `aligned` refuses an offset that is not a multiple of the page size, `canonical` a cursor not written as issued,
// both with 410 (dnsLog's history cursor is recomputed instead, so a noncanonical one is a 400).
const cursorRules: Partial<Record<ResourceName, {held: number; refuse?: boolean; aligned?: boolean; canonical?: boolean; emptyIs400?: boolean}>> = {
  nodes: {held: 8, aligned: true, canonical: true},
  providers: {held: 8, aligned: true, canonical: true},
  flows: {held: 8, aligned: true, emptyIs400: true},
  dnsCache: {held: 8, refuse: true},
  // honk keeps no dnsLog snapshot, only a history ring; the mock's 32 is its own bound.
  dnsLog: {held: 32}
};
const expired = () => new ApiError(410, 'snapshot_expired', 'Unknown or expired cursor');
const invalid = () => new ApiError(400, 'invalid_request', 'Cursor does not match this request');

// A page ends early once its rows pass `budget` bytes of JSON, as a backend's response budget ends it; it still
// carries at least one row, however large, and the cursor goes on from there. A cursor is bound to the filters and the
// page size it was issued with; either changed, it is refused.
export function createPager(resource: ResourceName, budget = Infinity) {
  const rules = cursorRules[resource] ?? {held: 32};
  const encoder = budget === Infinity ? null : new TextEncoder();
  const snapshots = new Map<string, {items: unknown[]; key: string; expires: number}>();
  const page = <T>(items: T[], query: {cursor?: string; limit?: number} = {}) => {
    const {cursor, limit: asked, ...filters} = query;
    const limit = pageLimit(asked);
    const key = normalizeResourceKey([resource, {...filters, limit}]);
    for (const [id, snapshot] of snapshots) if (snapshot.expires <= Date.now()) snapshots.delete(id);
    if (cursor === undefined && rules.refuse && snapshots.size >= rules.held) throw new ApiError(503, 'snapshot_unavailable', 'Snapshot capacity is full');
    if (cursor === '' && rules.emptyIs400) throw invalid();
    const [id, offset, extra] = cursor?.split(':') ?? [uuid(), '0'];
    const start = Number(offset);
    let snapshot = {items: items as unknown[], key, expires: Date.now() + 30000};
    if (cursor !== undefined) {
      const held = snapshots.get(id);
      if (!held || !/^\d+$/.test(offset ?? '') || !Number.isSafeInteger(start) || start < 1 || start >= held.items.length) throw expired();
      if (extra !== undefined && resource !== 'dnsLog') throw expired();
      if (held.key !== key) throw invalid();
      if ((rules.aligned && start % limit !== 0) || (rules.canonical && String(start) !== offset)) throw expired();
      if (resource === 'dnsLog' && (extra !== undefined || String(start) !== offset)) throw invalid();
      snapshot = held;
    }
    const page = snapshot.items.slice(start, start + limit);
    let size = 0;
    const over = encoder ? page.findIndex(item => (size += encoder.encode(JSON.stringify(item)).length) > budget) : -1;
    const end = start + (over < 0 ? page.length : Math.max(1, over));
    if (cursor === undefined && end < items.length) {
      snapshot.items = structuredClone(items);
      while (snapshots.size >= rules.held) snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(id, snapshot);
    }
    return {
      items: structuredClone(snapshot.items.slice(start, end)) as T[],
      total: snapshot.items.length,
      next_cursor: end < snapshot.items.length ? `${id}:${end}` : null
    };
  };
  return Object.assign(page, {
    invalidate: (evicted: ReadonlySet<string>) => {
      for (const [id, snapshot] of snapshots) if (snapshot.items.some(item => evicted.has((item as {id: string}).id))) snapshots.delete(id);
    }
  });
}
export function found<T>(value: T | undefined, kind: string): T {
  if (value === undefined) throw new ApiError(404, 'resource_not_found', `${kind} not found`);
  return value;
}
// Ordinary URL credentials remain visible; these demo URLs contain no listener secrets.
export function displayUrl(value: string): string | null {
  const url = URL.parse(value);
  return url ? value : null;
}
