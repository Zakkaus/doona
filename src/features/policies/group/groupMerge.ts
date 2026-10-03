import {unquote} from '../../../dae/text';
import type {GroupEntry, GroupEntryUpdate} from '../../../dae/groups';
import {routeValue} from '../../shared/groupText';

// The fields a save writes, as the dialog holds them: `default` and `final` unquoted, `interrupt` as written.
export type GroupFields = {filters: string[]; policy: string | null; default: string | null; final: string | null; interrupt: string | null};
export type GroupMerge = {kind: 'gone'} | {kind: 'conflict'} | {kind: 'merge'; keep: Partial<GroupEntryUpdate>};

// A retry after a refusal writes only the fields changed since the dialog opened (`opened`) and keeps the rest as read again (`current`),
// so another client's edits stay. There is nothing to merge into when the entry is gone or declared twice (`current` undefined), and a
// field changed both here and on disk, to different values, is not written. `keep` is laid over the update: the fields left as read again.
export function mergeGroupRetry(
  mine: GroupFields,
  opened: GroupEntry,
  current: GroupEntry | undefined,
  routes: ReadonlyArray<'default' | 'final'>
): GroupMerge {
  if (!current) return {kind: 'gone'};
  const keys = ['filters', 'policy', 'interrupt', ...routes] as const;
  type Key = (typeof keys)[number];
  // Interruption compares as a flag, so `'true'` and `true` agree.
  const flag = (value: string | null) => (value === null ? null : unquote(value) === 'true');
  const read = (from: GroupEntry, key: Key) =>
    JSON.stringify(key === 'default' || key === 'final' ? routeValue(from[key]) : key === 'interrupt' ? flag(from[key]) : from[key]);
  const own = (key: Key) => JSON.stringify(key === 'interrupt' ? flag(mine[key]) : mine[key]);
  // A field already holding the value read again is not written, so it keeps the spelling there.
  const changed = keys.filter(key => own(key) !== read(opened, key) && own(key) !== read(current, key));
  if (changed.some(key => read(current, key) !== read(opened, key))) return {kind: 'conflict'};
  const keep: Partial<GroupEntryUpdate> = {};
  for (const key of keys) if (!changed.includes(key)) Object.assign(keep, {[key]: key === 'filters' || key === 'policy' ? current[key] : undefined});
  return {kind: 'merge', keep};
}
