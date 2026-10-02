import {ApiError} from '../src/api/error';
import {uuid} from '../src/api/hash';
import {normalizeResourceKey} from '../src/api/inflight';
import type {ResourceName} from '../src/api/invalidation';

// The shared Limit1000 page size: 100 rows unless the caller asks, and never more than 1000.
export function pageLimit(limit = 100): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new ApiError(400, 'invalid_request', 'Invalid page size');
  return limit;
}

// A page ends early once its rows pass `budget` bytes of JSON, as a backend's response budget ends it; it still
// carries at least one row, however large, and the cursor goes on from there. A cursor is bound to the filters and the
// page size it was issued with; either changed, it is refused.
export function createPager(resource: ResourceName, budget = Infinity) {
  const snapshots = new Map<string, {items: unknown[]; key: string; expires: number}>();
  const page = <T>(items: T[], query: {cursor?: string; limit?: number} = {}) => {
    const {cursor, limit: asked, ...filters} = query;
    const limit = pageLimit(asked);
    const key = normalizeResourceKey([resource, {...filters, limit}]);
    for (const [id, snapshot] of snapshots) if (snapshot.expires <= Date.now()) snapshots.delete(id);
    const [id, offset, extra] = cursor?.split(':') ?? [uuid(), '0'];
    const start = Number(offset);
    const snapshot = cursor ? snapshots.get(id) : {items: items as unknown[], key, expires: Date.now() + 30000};
    if (!snapshot || extra !== undefined || snapshot.key !== key || !Number.isSafeInteger(start) || (cursor && (start < 1 || start >= snapshot.items.length)))
      throw new ApiError(
        resource === 'flows' || (resource === 'dnsLog' && !snapshot) ? 410 : 400,
        resource === 'flows' || (resource === 'dnsLog' && !snapshot) ? 'snapshot_expired' : 'invalid_request',
        'Unknown or expired cursor'
      );
    const page = snapshot.items.slice(start, start + limit);
    let size = 0;
    const over = page.findIndex(item => (size += JSON.stringify(item).length) > budget);
    const end = start + (over < 0 ? page.length : Math.max(1, over));
    if (!cursor && end < items.length) {
      snapshot.items = structuredClone(items);
      if (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!);
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
