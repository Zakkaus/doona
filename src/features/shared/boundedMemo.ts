export function boundedMemo<T>(compute: (name: string) => T, limit = 2048): (name: string) => T {
  const cache = new Map<string, T>();
  return name => {
    if (cache.has(name)) return cache.get(name)!;
    const result = compute(name);
    if (cache.size >= limit) cache.delete(cache.keys().next().value!);
    cache.set(name, result);
    return result;
  };
}
