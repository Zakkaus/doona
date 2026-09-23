import {ApiError} from '../error';
import {uuid} from '../hash';
import {normalizeResourceKey} from '../inflight';
import type {ResourceName} from '../invalidation';

export function createPager(resource: ResourceName) {
  const snapshots = new Map<string, {items: unknown[]; key: string; expires: number}>();
  return <T>(items: T[], query: {cursor?: string; limit?: number} = {}) => {
    const {cursor, limit = 1000, ...filters} = query;
    const key = normalizeResourceKey([resource, filters]);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new ApiError(400, 'invalid_request', 'Invalid page size');
    for (const [id, snapshot] of snapshots) if (snapshot.expires <= Date.now()) snapshots.delete(id);
    const [id, offset, extra] = cursor?.split(':') ?? [uuid(), '0'];
    const start = Number(offset);
    let snapshot = cursor ? snapshots.get(id) : undefined;
    if (cursor && (extra !== undefined || !snapshot || snapshot.key !== key || !Number.isSafeInteger(start) || start < 1 || start >= snapshot.items.length))
      throw new ApiError(resource === 'flows' ? 410 : 400, resource === 'flows' ? 'snapshot_expired' : 'invalid_request', 'Unknown or expired cursor');
    if (!snapshot) {
      if (items.length <= limit) return {items: structuredClone(items), total: items.length, next_cursor: null};
      snapshot = {items: structuredClone(items), key, expires: Date.now() + 30000};
      if (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(id, snapshot);
    }
    const end = start + limit;
    return {
      items: structuredClone(snapshot.items.slice(start, end)) as T[],
      total: snapshot.items.length,
      next_cursor: end < snapshot.items.length ? `${id}:${end}` : null
    };
  };
}
export function found<T>(value: T | undefined, kind: string): T {
  if (value === undefined) throw new ApiError(404, 'resource_not_found', `${kind} not found`);
  return value;
}
