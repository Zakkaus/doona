import {useCallback, useDeferredValue, useMemo, useState} from 'react';
import {useFilter} from 'react-aria-components';
import {useT} from '../../../i18n';
import type {Key} from '../../../i18n';
import {refetchAll, useCapabilities, useNodes, useProviders} from '../../../store';
import {applyChanges, isWritableName, readGroupEntries, type GroupChange} from '../../../dae/groups';
import {toast} from '../../../ui/ui';
import {useDraftGuard} from '../../../shell/draft';
import type {MainSourceEdit} from '../../../store/mainSource';
import {groupNameError} from '../../shared/policyText';
import {arrangeView, changeText, holds, stage, traySubscriptions, unstage, type Placeable} from './view';
import {errorText} from '../../../api/error';
import {offered} from '../../../api/capabilities';

// What a dragged tray row carries.
export const PLACEABLE = 'application/x-doona-placeable';

export function useArrange(source: Pick<MainSourceEdit, 'main' | 'writable' | 'busy' | 'apply' | 'error'>) {
  const t = useT();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const nodeList = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  const providers = useProviders(offered(resources, 'providers', {whileLoading: false}));
  const nodes = nodeList.data;
  const [changes, setChanges] = useState<GroupChange[]>([]);
  // Leaving the page after confirming the draft guard drops what was staged.
  const guard = useDraftGuard(changes.length > 0, () => setChanges([]));
  const text = source.main?.content ?? '';
  const subscriptions = useMemo(() => traySubscriptions(providers.data?.providers ?? [], nodes ?? []), [providers.data, nodes]);
  const view = useMemo(() => arrangeView(text, changes, subscriptions, nodes ?? [], t), [text, changes, subscriptions, nodes, t]);
  const byGroup = useMemo(() => new Map(view.groups.map(group => [group.name, group])), [view.groups]);
  const {contains} = useFilter({sensitivity: 'base'});
  const [search, setSearch] = useState('');
  const needle = useDeferredValue(search).trim();
  const trayNodes = useMemo(
    () => (nodes ?? []).filter(node => !needle || contains(node.name, needle) || contains(node.protocol ?? '', needle)),
    [nodes, needle, contains]
  );
  const traySubs = useMemo(() => subscriptions.filter(item => !needle || contains(item.label, needle)), [subscriptions, needle, contains]);
  const [reviewing, setReviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  // A refused or failed apply is reported inside the review sheet, where it happened.
  const [failure, setFailure] = useState<string | null>(null);
  const blockedReason: Key | null = !source.writable ? 'arrange.readOnly' : !source.main ? 'arrange.noMain' : null;
  const edit = (next: (current: GroupChange[]) => GroupChange[]) => {
    if (applying) return;
    setFailure(null);
    setChanges(next);
  };
  // Items the group already holds exactly are skipped: adding them again would stage an edit that writes nothing.
  const place = (group: string, items: Placeable[]) => {
    if (items.some(item => !isWritableName(item.value))) toast('negative', t('config.unquotable'));
    edit(current =>
      items
        .filter(item => !holds(byGroup.get(group), item))
        .reduce((staged, item) => stage(staged, {kind: item.kind === 'node' ? 'addNode' : 'addSubscription', group, value: item.value}), current)
    );
  };
  const unplace = (group: string, item: Placeable) =>
    edit(current => stage(current, {kind: item.kind === 'node' ? 'removeNode' : 'removeSubscription', group, value: item.value}));
  const existing = new Set(view.groups.map(group => group.name));
  const nameProblem = (name: string) => groupNameError(name, existing, t);
  const apply = async () => {
    setApplying(true);
    setFailure(null);
    try {
      const result = await source.apply(current => applyChanges(current, changes));
      if (result.kind === 'invalid') setFailure(t('ui.writeInvalid', {n: result.errors}));
      if (result.kind === 'failed') setFailure(t('arrange.failed', {error: errorText(result.error, t)}));
      if (result.kind === 'ok') {
        toast('positive', t('arrange.applied', {n: changes.length}));
        setChanges([]);
        guard.clear();
        setReviewing(false);
      }
    } finally {
      setApplying(false);
    }
  };
  // The review shows each touched group as it will be written, not a line diff of the whole file.
  const preview = useMemo(() => {
    if (!changes.length) return [];
    const lines = view.stagedText.split('\n');
    const touched = new Set(changes.map(change => change.group));
    return readGroupEntries(view.stagedText)
      .filter(entry => touched.has(entry.name))
      .map(entry => ({group: entry.name, text: lines.slice(entry.from, entry.to + 1).join('\n')}));
  }, [view.stagedText, changes]);
  return {
    groups: view.groups,
    unknown: view.unknown,
    byGroup,
    subscriptions: traySubs,
    nodes: trayNodes,
    search,
    setSearch,
    // A backend without a node or provider list still arranges what it has; only a request in flight waits.
    loading: (capabilities.loading && !capabilities.data) || (nodeList.loading && !nodes) || (providers.loading && !providers.data),
    // A failed poll with data already shown keeps the page and what is staged on it.
    error: [capabilities, nodeList, providers].find(resource => resource.error && !resource.data)?.error ?? (source.main ? null : source.error),
    retry: useCallback(() => void refetchAll(), []),
    blocked: blockedReason ? t(blockedReason) : null,
    busy: source.busy || applying,
    applying,
    failure,
    changes,
    changeLines: changes.map(change => changeText(change, subscriptions, t)),
    pendingText: t('arrange.pending', {n: changes.length}),
    place,
    unplace,
    drop: (index: number) => edit(current => unstage(current, index)),
    discard: () => edit(() => []),
    nameProblem,
    create: (name: string, policy: string) => edit(current => stage(current, {kind: 'createGroup', group: name, policy})),
    // With nothing left to review the sheet closes by itself.
    reviewing: reviewing && changes.length > 0,
    setReviewing: (open: boolean) => {
      // The sheet stays open while its apply runs, so what is being written stays in view.
      if (!applying) setReviewing(open);
    },
    preview,
    canApply: changes.length > 0 && view.emptyNew.length === 0 && !blockedReason && !applying,
    applyNote: view.emptyNew.length ? t('arrange.emptyNew', {group: view.emptyNew[0]}) : null,
    apply
  };
}
