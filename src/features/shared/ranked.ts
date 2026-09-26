// Counts by key, largest first then by name, keeping the first `limit` and the total of the rest.
export function ranked<K extends string | null>(keys: K[], limit: number): {top: Array<{key: K; count: number}>; rest: number} {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  // Ties go by code point, the same in every language; a missing key (null) comes last.
  const order = (a: K, b: K) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);
  const all = [...counts].map(([key, count]) => ({key, count})).sort((a, b) => b.count - a.count || order(a.key, b.key));
  return {top: all.slice(0, limit), rest: all.slice(limit).reduce((sum, item) => sum + item.count, 0)};
}
