// Structural sharing, as TanStack Query does it: the result equals `next`, but every subtree equal to the one in
// `previous` is the previous object itself. An unchanged response is therefore `previous`, and a changed one keeps
// the identity of everything around the change, so memos keyed on unchanged parts do not recompute.
const plain = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

export function replaceEqualDeep<T>(previous: unknown, next: T): T {
  if (Object.is(previous, next)) return previous as T;
  const arrays = Array.isArray(previous) && Array.isArray(next);
  if (!arrays && !(plain(previous) && plain(next))) return next;
  const before = previous as Record<string | number, unknown>;
  const after = next as Record<string | number, unknown>;
  const keys: Array<string | number> = arrays ? (next as unknown[]).map((_, i) => i) : Object.keys(after);
  const copy = (arrays ? [] : {}) as Record<string | number, unknown>;
  let same = arrays ? (previous as unknown[]).length === keys.length : Object.keys(before).length === keys.length;
  for (const key of keys) {
    copy[key] = replaceEqualDeep(before[key], after[key]);
    if (copy[key] !== before[key] || !(key in before)) same = false;
  }
  return (same ? previous : copy) as T;
}
