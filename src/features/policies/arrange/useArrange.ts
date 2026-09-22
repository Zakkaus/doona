import {useCallback, useDeferredValue, useMemo, useState} from 'react';
import {useT} from '../../../i18n';
import type {Key} from '../../../i18n/messages';
import type {Node} from '../../../api/model';
import {useCapabilities, useProviders} from '../../../store';
import {applyChanges, readGroupEntries, type GroupChange} from '../../../dae/groups';
import {errorText, toast, useLinked} from '../../../ui/ui';
import {useDraftGuard} from '../../config/useDraftGuard';
import type {MainSourceEdit} from '../../config/mainSource';
import {arrangeView, changeText, stage, traySubscriptions} from './view';

export type Placeable = {kind: 'node' | 'subscription'; value: string};
// What a dragged tray row carries; also accepted as plain text so a drop from elsewhere is simply ignored.
export const PLACEABLE = 'application/x-doona-placeable';
const GROUP_NAME = /^[\w.-]+$/;

export function useArrange(source: Pick<MainSourceEdit, 'main' | 'writable' | 'busy' | 'apply' | 'error'>, nodes: Node[] | undefined) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(resources?.providers.available === true);
  const [changes, setChanges] = useState<GroupChange[]>([]);
  const guard = useDraftGuard(changes.length > 0);
  // Leaving the page after confirming the draft guard drops what was staged.
  useLinked(guard.revision, () => setChanges([]));
  const text = source.main?.content ?? '';
  const subscriptions = useMemo(() => traySubscriptions(providers.data?.providers ?? [], nodes ?? []), [providers.data, nodes]);
  const view = useMemo(() => arrangeView(text, changes, subscriptions, nodes ?? [], t), [text, changes, subscriptions, nodes, t]);
  const [search, setSearch] = useState('');
  const needle = useDeferredValue(search).trim().toLowerCase();
  const trayNodes = useMemo(
    () => (nodes ?? []).filter(node => !needle || node.name.toLowerCase().includes(needle) || (node.protocol ?? '').toLowerCase().includes(needle)),
    [nodes, needle]
  );
  const traySubs = useMemo(() => subscriptions.filter(item => !needle || item.label.toLowerCase().includes(needle)), [subscriptions, needle]);
  const [reviewing, setReviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const blockedReason: Key | null = !source.writable ? 'arrange.readOnly' : !source.main ? 'arrange.noMain' : null;
  const place = useCallback((group: string, item: Placeable) => {
    setChanges(current => stage(current, {kind: item.kind === 'node' ? 'addNode' : 'addSubscription', group, value: item.value}));
  }, []);
  const unplace = useCallback((group: string, item: Placeable) => {
    setChanges(current => stage(current, {kind: item.kind === 'node' ? 'removeNode' : 'removeSubscription', group, value: item.value}));
  }, []);
  // A staged group and everything staged into it go together.
  const drop = (index: number) =>
    setChanges(current => {
      const change = current[index];
      return current.filter((other, i) => i !== index && !(change.kind === 'createGroup' && other.group === change.group));
    });
  const existing = useMemo(() => new Set(view.groups.map(group => group.name)), [view.groups]);
  const nameProblem = (name: string): Key | null => (!GROUP_NAME.test(name) ? 'arrange.badName' : existing.has(name) ? 'arrange.takenName' : null);
  const create = (name: string, policy: string) => setChanges(current => stage(current, {kind: 'createGroup', group: name, policy}));
  const apply = async () => {
    setApplying(true);
    try {
      const written = await source.apply(
        current => applyChanges(current, changes),
        errors => toast('negative', t('arrange.invalid', {n: errors}))
      );
      if (written) {
        toast('positive', t('arrange.applied', {n: changes.length}));
        setChanges([]);
        guard.clear();
        setReviewing(false);
      }
    } catch (error) {
      toast('negative', errorText(error));
    } finally {
      setApplying(false);
    }
  };
  // The review shows each touched group as it will be written, not a line diff of the whole file.
  const preview = useMemo(() => {
    if (!changes.length) return [];
    const next = applyChanges(text, changes);
    const lines = next.split('\n');
    const touched = new Set(changes.map(change => change.group));
    return readGroupEntries(next)
      .filter(entry => touched.has(entry.name))
      .map(entry => ({group: entry.name, text: lines.slice(entry.from, entry.to + 1).join('\n')}));
  }, [text, changes]);
  return {
    ...view,
    subscriptions: traySubs,
    nodes: trayNodes,
    allSubscriptions: subscriptions,
    search,
    setSearch,
    blocked: blockedReason ? t(blockedReason) : null,
    busy: source.busy || applying,
    changes,
    changeLines: changes.map(change => changeText(change, subscriptions, t)),
    pendingText: t('arrange.pending', {n: changes.length}),
    place,
    unplace,
    drop,
    discard: () => setChanges([]),
    nameProblem: (name: string) => {
      const key = nameProblem(name);
      return key ? t(key) : null;
    },
    create,
    reviewing,
    setReviewing,
    preview,
    canApply: changes.length > 0 && view.emptyNew.length === 0 && !blockedReason,
    applyNote: view.emptyNew.length ? t('arrange.emptyNew', {group: view.emptyNew[0]}) : null,
    apply
  };
}
