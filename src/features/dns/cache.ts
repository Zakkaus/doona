import type {DnsCacheList} from '../../api/model';

// What the cache holds, from its listing: the backend reports how many entries there are and what kinds it caches,
// not a capacity, so the state is described by freshness and kind rather than as a share of a limit.
export function cacheState(list: DnsCacheList | undefined, now = Date.now()) {
  if (!list) return null;
  let fresh = 0;
  let stale = 0;
  let negative = 0;
  for (const entry of list.entries) {
    const expires = Date.parse(entry.expires_at);
    // Past its expiry but inside its stale window, an entry is still served while it is refreshed.
    if (expires > now) fresh++;
    else stale++;
    if (entry.status !== 'NOERROR') negative++;
  }
  return {total: list.total, loaded: list.entries.length, fresh, stale, negative, positive: list.entries.length - negative, coverage: list.coverage};
}
