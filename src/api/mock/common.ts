import {ApiError} from '../error';
export function page<T>(items: T[], cursor?: string, limit = 1000) {
  const start = cursor ? Number(cursor) : 0;
  if (!Number.isSafeInteger(start) || start < 0 || start > items.length) throw new ApiError(400, 'invalid_request', 'Unknown or expired cursor');
  const end = start + limit;
  return {items: items.slice(start, end), next_cursor: end < items.length ? String(end) : null};
}
export function found<T>(value: T | undefined, kind: string): T {
  if (value === undefined) throw new ApiError(404, 'resource_not_found', `${kind} not found`);
  return value;
}
