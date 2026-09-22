export function createFeed<T extends {id: string}, S extends object>(limit: number, status: S, replay: 'replace' | 'ignore') {
  const records = new Map<string, T>();
  const listeners = new Set<() => void>();
  let snapshot = {records: [] as T[], ...status};
  let dirty = false;
  let recordsDirty = false;
  let statusDirty = false;
  // While held, records keep accumulating in the bounded ring but the published list stays as it was, and a
  // record-only change publishes nothing: a paused 10 Hz stream causes no renders.
  let held = false;
  let timer: number | undefined;
  const publish = () => {
    timer = undefined;
    if (document.hidden || !dirty) return;
    if (held && !statusDirty) return;
    dirty = false;
    statusDirty = false;
    // A status-only change keeps the list reference, so memoised rows downstream do not recompute.
    const list = held || !recordsDirty ? snapshot.records : [...records.values()].reverse();
    if (!held) recordsDirty = false;
    snapshot = {records: list, ...status};
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
      if (records.has(record.id)) {
        if (replay === 'ignore') return;
        records.delete(record.id);
      }
      records.set(record.id, record);
      if (records.size > limit) records.delete(records.keys().next().value!);
      recordsDirty = true;
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
      snapshot = {...snapshot, records: []};
      statusDirty = true;
      schedule();
    },
    hold(on: boolean) {
      held = on;
      if (!on) schedule();
    }
  };
}
