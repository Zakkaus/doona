// Ids that carry their kind as a prefix, `kind:value`. The value may hold colons of its own.
export const tagId = (kind: string, value: string) => `${kind}:${value}`;
export function readTag<K extends string>(id: string, kinds: readonly K[]): {kind: K; value: string} | null {
  const colon = id.indexOf(':');
  const kind = id.slice(0, colon) as K;
  return colon > 0 && kinds.includes(kind) ? {kind, value: id.slice(colon + 1)} : null;
}
