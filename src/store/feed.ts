export function createFeed<T extends {id: string}, S extends object>(
  limit: number,
  status: S,
  replay: 'replace' | 'ignore',
  key: (record: T) => string = record => record.id
) {
  const records = new Map<string, T>();
  // Records after which the stream lost history; the list shows a marker above each.
  const gaps = new Set<T>();
  const listeners = new Set<() => void>();
  let snapshot = {records: [] as T[], gaps: new Set(gaps) as ReadonlySet<T>, pending: 0, ...status};
  let dirty = false;
  let recordsDirty = false;
  let statusDirty = false;
  // While held, records keep accumulating in the bounded ring but the published list stays as it was; only the
  // count of records appended since holding is published, so a paused stream re-renders no rows.
  let held = false;
  let pending = 0;
  let timer: number | undefined;
  const publish = () => {
    timer = undefined;
    if (document.hidden || !dirty) return;
    if (held && !statusDirty) return;
    dirty = false;
    statusDirty = false;
    // A status-only change keeps the list reference, so memoised rows downstream do not recompute.
    const stale = held || !recordsDirty;
    const list = stale ? snapshot.records : [...records.values()].reverse();
    if (!held) recordsDirty = false;
    snapshot = {records: list, gaps: stale ? snapshot.gaps : new Set(gaps), pending, ...status};
    listeners.forEach(notify => notify());
  };
  const schedule = () => {
    dirty = true;
    // Nobody is reading: the first subscriber publishes what accumulated.
    if (!document.hidden && listeners.size && timer === undefined) timer = window.setTimeout(publish, 100);
  };
  const visibility = () => {
    if (document.hidden) {
      clearTimeout(timer);
      timer = undefined;
    } else publish();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      listeners.add(notify);
      if (listeners.size === 1) {
        document.addEventListener('visibilitychange', visibility);
        if (dirty) schedule();
      }
      return () => {
        listeners.delete(notify);
        if (listeners.size) return;
        document.removeEventListener('visibilitychange', visibility);
        clearTimeout(timer);
        timer = undefined;
      };
    },
    append(record: T) {
      const id = key(record);
      if (records.has(id)) {
        if (replay === 'ignore') return;
        records.delete(id);
      }
      records.set(id, record);
      if (records.size > limit) {
        const [oldest, evicted] = records.entries().next().value!;
        records.delete(oldest);
        gaps.delete(evicted);
      }
      recordsDirty = true;
      if (held) {
        pending++;
        statusDirty = true;
      }
      schedule();
    },
    update(change: Partial<S>) {
      if (Object.entries(change).every(([key, value]) => status[key as keyof S] === value)) return;
      status = {...status, ...change};
      statusDirty = true;
      schedule();
    },
    // Clearing is explicit, so it empties the published list even while held.
    clear() {
      records.clear();
      gaps.clear();
      pending = 0;
      snapshot = {...snapshot, records: [], gaps: new Set(), pending};
      statusDirty = true;
      schedule();
    },
    markGap() {
      const newest = [...records.values()].at(-1);
      if (!newest || gaps.has(newest)) return;
      gaps.add(newest);
      recordsDirty = true;
      schedule();
    },
    hold(on: boolean) {
      held = on;
      pending = 0;
      if (!on) schedule();
    }
  };
}
