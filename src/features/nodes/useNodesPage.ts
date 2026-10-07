import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useT, useLang, formatList} from '../../i18n';
import {useCapabilities, useNodeManage, useNodes, useOutboundNames, useSteadyNodes, useProviderRefresh, useProviders, useVersion} from '../../store';
import {useCompleteness, useConfig} from '../../store/config';
import type {ConfigSource, Node, Provider} from '../../api/model';
import {toast, toastFailure, type Problem} from '../../ui/ui';
import {editProblem, useMainSourceEdit} from '../../store/mainSource';
import {isWritableName, groupsNamingTag, readGroupEntries} from '../../dae/groups';
import {isBareName} from '../../dae/text';
import {agentProblem, readSubscriptionEntries, type SubscriptionText} from '../../dae/subscriptions';
import {engineOf} from '../../api/engines';
import {readNodeEntries, writeNodeEntry, type NodeEntry} from '../../dae/nodes';
import type {PageProps} from '../../shell/routes';
import {replaceRoute} from '../../shell/route';
import {
  editableSource,
  joinableGroups,
  subscriptionPlace,
  subscriptionActionKind,
  nodeEditState,
  declaredInInclude,
  subscriptionRemoval,
  nodeFormReason,
  nodeLinkError,
  nodeSource,
  ownedNodes,
  providerCreate,
  providerChanges,
  providerRows,
  selectedProvider,
  subscriptionUrlError,
  type ProviderForm,
  type ProviderRow
} from './view';
import {useProviderTable} from './useProviderTable';
import {draftInterval, intervalProblem} from './subscription';
import {useRefreshAll} from '../shared/useRefreshAll';
import {useNodeTable} from './useNodeTable';
import {useSubscriptionEditor, type SubscriptionEdit} from './useSubscriptionEditor';
import {useDialogSession, useDraftGuard} from '../../shell/draft';
import {errorText, noticeText, requestIdOf, type Notice} from '../../api/error';
import {href, pickTab, tabQuery, within} from '../../shell/route';
import {noNodeSources} from '../../api/selectors';
import {offered} from '../../api/capabilities';
import {nodesTabs} from './nav';
import type {SubscriptionDraft, SubscriptionFieldSet} from './SubscriptionFields';

const blank: ProviderForm = {name: '', value: '', interval: '', agent: '', cache: null, route: ''};

type NodeDialog =
  | {kind: 'provider'}
  | {kind: 'node'}
  | {kind: 'editNode'; source: ConfigSource; entry: NodeEntry}
  | {kind: 'removeProvider'; item: Provider}
  | {kind: 'removeNode'; item: Node}
  | SubscriptionEdit;

export function runSubscriptionAction(query: string, action: {run: () => void} | null) {
  if (!action) return;
  replaceRoute('nodes', within(query, {editSubscription: null, editSubscriptionTag: null, focus: null}));
  action.run();
}

export function useNodesPage({go, query}: PageProps) {
  const t = useT();
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [form, setForm] = useState<ProviderForm>(blank);
  const session = useDialogSession();
  const submitting = useRef<NodeDialog | null>(null);
  const [pendingDialog, setPendingDialog] = useState<NodeDialog | null>(null);
  // Why the last submit did not land; `id` changes with each refusal so the alert takes focus again.
  const [problem, setProblem] = useState<Problem | null>(null);
  const intervalSeconds = draftInterval(form.interval);
  const resources = useCapabilities().data?.resources;
  const createOptions = resources?.providers.create_options;
  const changes = dialog?.kind === 'editProvider' ? providerChanges(form, dialog.entry, createOptions?.cache) : null;
  const edited = changes
    ? Object.values(changes).some(Boolean)
    : dialog?.kind === 'editNode'
      ? form.name !== dialog.entry.name || form.value !== dialog.entry.link
      : !!(form.name || form.value);
  const guard = useDraftGuard(!!dialog && edited, () => {
    session.next();
    setDialog(null);
  });
  const open = useCallback(
    (next: NodeDialog) => {
      session.next();
      setForm(blank);
      setProblem(null);
      if (next.kind === 'editProvider')
        setForm({...blank, name: next.entry.tag, value: next.entry.url, agent: next.entry.ua ?? '', route: next.entry.route ?? ''});
      if (next.kind === 'editNode') setForm({...blank, name: next.entry.name, value: next.entry.link});
      setDialog(next);
    },
    [session]
  );
  const lang = useLang();
  const providers = useProviders(offered(resources, 'providers', {whileLoading: true}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: true}));
  const nodeList = useSteadyNodes(nodes.data);
  const names = useOutboundNames();
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const {refetch: refetchConfig} = config;
  const {refetch: refetchProviders} = providers;
  const {refetch: refetchNodes} = nodes;
  const reload = useCallback(() => {
    refetchProviders();
    refetchNodes();
    refetchConfig();
  }, [refetchProviders, refetchNodes, refetchConfig]);
  const manage = useNodeManage(reload);
  const refreshing = useProviderRefresh(reload);
  const refreshAll = useRefreshAll(providers, refreshing);
  const source = useMainSourceEdit();
  // A subscription is edited in whichever source declares it, and only in dae text this page knows how to write.
  const version = useVersion().data;
  const daeText = engineOf(version).daeText;
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const isComplete = useCompleteness(sources);
  const declared = useMemo(() => {
    const found = new Map<string, Array<{source: ConfigSource; entry: SubscriptionText}>>();
    for (const item of sources)
      for (const entry of readSubscriptionEntries(item.content)) found.set(entry.tag, [...(found.get(entry.tag) ?? []), {source: item, entry}]);
    return found;
  }, [sources]);
  const groupsEverywhere = useMemo(() => [...new Set(sources.flatMap(item => readGroupEntries(item.content ?? '').map(entry => entry.name)))], [sources]);
  const subscriptionEdit = useSubscriptionEditor({
    dialog: dialog?.kind === 'editProvider' ? dialog : null,
    form,
    sources,
    declared,
    groups: groupsEverywhere,
    createOptions,
    lang,
    t
  });
  const editAction = useCallback(
    (item: ProviderRow, focus?: 'interval') => {
      if (!version || !resources) return null;
      const tag = item.configTag ?? item.sourceTag;
      const place = subscriptionPlace(tag ? (declared.get(tag) ?? []) : [], item, providers.data?.providers ?? []);
      if (!place) return null;
      const {source: origin, entry, unique} = place;
      const kind = subscriptionActionKind(unique, daeText, source.writable, origin, isComplete(origin));
      if (kind === null) return null;
      if (kind === 'edit') return {kind: 'edit' as const, run: () => open({kind: 'editProvider', item, source: origin, entry, focus})};
      return {kind: 'open' as const, run: () => go('config', within('', {tab: 'source', source: origin.id, line: String(entry.line)}))};
    },
    [version, resources, declared, providers.data, daeText, source.writable, isComplete, open, go]
  );
  const authored = useMemo(
    () =>
      sources
        .filter(item => item.kind === 'main' || item.kind === 'include')
        .flatMap(source => readNodeEntries(source.content).map(entry => ({source, entry}))),
    [sources]
  );
  const nodeEdit = useCallback(
    (node: Node) => {
      const own = authored.filter(item => item.entry.name === node.name);
      const inline = providers.data?.providers.some(provider => provider.id === node.provider_id && provider.kind === 'inline');
      if (!inline || own.length !== 1 || !editableSource(daeText, source.writable, own[0].source, isComplete(own[0].source))) return null;
      return () => open({kind: 'editNode', ...own[0]});
    },
    [authored, providers.data, daeText, source.writable, isComplete, open]
  );
  // Every source on this page is written through the one shared editor, so its busy flag covers each declaring source.
  const joinable = useMemo(() => joinableGroups(sources, isComplete, () => source.busy), [sources, isComplete, source.busy]);
  const nodeInInclude = useCallback((node: Node) => declaredInInclude(authored.filter(item => item.entry.name === node.name)), [authored]);
  const providerInInclude = useCallback((item: ProviderRow) => declaredInInclude(item.sourceTag ? (declared.get(item.sourceTag) ?? []) : []), [declared]);
  const entries = useMemo(() => [...declared.values()].filter(items => items.length === 1).map(items => items[0].entry), [declared]);
  const {list} = useMemo(() => providerRows(providers.data?.providers ?? [], nodeList ?? [], entries, t), [providers.data, nodeList, entries, t]);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const canAddProvider = resources?.providers.can_manage === true;
  useLayoutEffect(() => {
    if (params.get('add') !== 'subscription' || !resources) return;
    const frame = requestAnimationFrame(() => {
      const remaining = new URLSearchParams(params);
      remaining.delete('add');
      replaceRoute('nodes', remaining.toString());
      if (canAddProvider) open({kind: 'provider'});
    });
    return () => cancelAnimationFrame(frame);
  }, [params, resources, canAddProvider, open]);
  useLayoutEffect(() => {
    const id = params.get('editSubscription');
    const tag = params.get('editSubscriptionTag');
    if ((!id && !tag) || !providers.data || !config.data) return;
    const matches = tag ? list.filter(item => (item.configTag ?? item.sourceTag) === tag) : list.filter(item => item.id === id);
    const item = matches.length === 1 ? matches[0] : null;
    const action = item ? editAction(item, params.get('focus') === 'interval' ? 'interval' : undefined) : null;
    if (!action) return;
    const frame = requestAnimationFrame(() => {
      runSubscriptionAction(query, action);
    });
    return () => cancelAnimationFrame(frame);
  }, [params, providers.data, config.data, list, editAction, query]);
  const selectedId = selectedProvider(list, params.get('provider'));
  const provider = list.find(item => item.id === selectedId) ?? null;
  const owned = useMemo(() => {
    const owner = list.find(item => item.id === selectedId);
    return ownedNodes(nodeList ?? [], owner?.kind === 'builtin' || owner?.kind === 'unattributed' ? null : owner?.id, owner?.kind);
  }, [nodeList, list, selectedId]);
  // Keyed on the owners' names, so the rows survive a poll that moves only what the sources table counts.
  const owners = JSON.stringify([list.map(item => [item.id, item.displayName ?? item.name]), (providers.data?.providers ?? []).map(item => item.id)]);
  const sourceOf = useMemo(() => {
    const [names, ids] = JSON.parse(owners) as [Array<[string, string]>, string[]];
    return nodeSource(
      new Map(names),
      ids.map(id => ({id}))
    );
  }, [owners]);
  const {apply} = source;
  // A written group and an added subscription each offer the next place to look.
  const viewNodes = (id: string) => ({label: t('nodes.viewNodes'), onAction: () => go('nodes', within('', {provider: id})), closeOnAction: true});
  const joinExistingGroup = useCallback(
    (node: Node, group: string) => {
      if (!isWritableName(node.name)) {
        toast('negative', t('config.unquotable'));
        return;
      }
      go('policies', within('', {group, edit: '1', node: node.name}));
    },
    [go, t]
  );
  const addNode = useCallback(() => open({kind: 'node'}), [open]);
  const newGroup = useCallback(
    (node: Node) => {
      if (!isWritableName(node.name)) {
        toast('negative', t('config.unquotable'));
        return;
      }
      go('policies', within('', {new: '1', node: node.name}));
    },
    [go, t]
  );
  const removeNode = useCallback((item: Node) => open({kind: 'removeNode', item}), [open]);
  // The query while this page is shown, null once it is left, so a late result can tell whether the person moved on.
  const shown = useRef<string | null>(query);
  useLayoutEffect(() => {
    shown.current = query;
    return () => {
      shown.current = null;
    };
  }, [query]);
  const submit = async (close: () => void) => {
    if (!dialog || submitting.current) return;
    submitting.current = dialog;
    setPendingDialog(dialog);
    const isCurrent = session.start();
    const at = shown.current;
    // A refusal after the dialog closed has nowhere inline to go.
    const refuse = (text: string, toastText = text, error?: unknown, kind: Notice['kind'] = 'negative') => {
      if (isCurrent()) setProblem(prev => ({id: (prev?.id ?? 0) + 1, text, kind}));
      else toast(kind, toastText, {requestId: error === undefined ? undefined : requestIdOf(error), error});
    };
    const refuseNotice = (problem: Notice) => refuse(noticeText(problem, t), noticeText(problem, t, false), problem.error, problem.kind);
    try {
      if (dialog.kind === 'provider') {
        // The backend's label for a subscription may be opaque; the toast names it as the user did.
        const created = await manage.addProvider(providerCreate(form, createOptions));
        if (!created) return;
        const name = form.name.trim();
        if (isCurrent()) {
          guard.clear();
          close();
        }
        // The new row is selected once it exists, whatever its first refresh does, unless the person has since
        // chosen another row or page.
        if (at !== null && shown.current === at) go('nodes', within(at, {provider: created.id}), {replace: true});
        // The contract creates the provider unfetched; a refresh is what turns it into nodes.
        if (resources?.providers.can_refresh) {
          // The person never pressed this refresh, so a failure offers it again from the toast.
          const fetchAdded = () =>
            void refreshing.refresh(created.id).then(
              result => {
                if (!result) return;
                if ('degraded' in result) toast('warning', t('nodes.refreshedDegraded', {name}), {action: viewNodes(created.id)});
                else toast('positive', t('nodes.addedRefreshed', {name, n: result.node_count}), {action: viewNodes(created.id)});
              },
              error => toastFailure(error, t, t('nodes.addedRefreshFailed', {name}), {label: t('ui.retry'), onAction: fetchAdded, closeOnAction: true})
            );
          fetchAdded();
          return;
        }
        toast('positive', t('nodes.added', {name}), {action: viewNodes(created.id)});
        return;
      } else if (dialog.kind === 'node') {
        const created = await manage.addNode({name: form.name.trim(), link: form.value.trim()});
        if (!created) return;
        toast('positive', t('nodes.added', {name: created.name}));
      } else if (dialog.kind === 'editNode') {
        if (!formValid) return;
        const current = sources.find(item => item.id === dialog.source.id);
        if (!current || !current.writable || isComplete(current) !== true) {
          refuse(t('nodes.editNodeMissing'));
          return;
        }
        const result = await apply(text => writeNodeEntry(text, dialog.entry, {name: form.name.trim(), link: form.value.trim()}), current);
        const problem = editProblem(result, t);
        if (problem) refuseNotice(problem);
        if (result.kind !== 'ok') return;
        reload();
        if (isCurrent() && at !== null && shown.current === at && (params.has('node') || params.has('nodes') || params.get('q') === dialog.entry.name)) {
          guard.clear();
          go('nodes', within(at, {q: form.name.trim(), node: null, nodes: null}), {replace: true});
        }
        toast('positive', t('nodes.edited', {name: form.name.trim()}));
      } else if (dialog.kind === 'editProvider') {
        const tag = form.name.trim();
        if (!subscriptionEdit.source) {
          refuse(t(declared.get(dialog.entry.tag)?.length ? 'nodes.tagTaken' : 'nodes.editMissing'));
          return;
        }
        const result = await apply(subscriptionEdit.write, subscriptionEdit.source);
        const problem = editProblem(result, t);
        if (problem) refuseNotice(problem);
        if (result.kind !== 'ok') return;
        refetchProviders();
        toast('positive', t('nodes.edited', {name: tag}));
      } else if (dialog.kind === 'removeProvider') {
        if (blockers.length || checkingRemoval) return;
        if (!(await manage.removeProvider(dialog.item.id))) return;
        toast('positive', t('nodes.removed', {name: dialog.item.name}));
      } else {
        if (!(await manage.removeNode(dialog.item.id))) return;
        toast('positive', t('nodes.removed', {name: dialog.item.name}));
      }
      if (isCurrent()) {
        guard.clear();
        close();
      }
    } catch (error) {
      refuse(errorText(error, t), errorText(error, t, false), error);
    } finally {
      submitting.current = null;
      setPendingDialog(null);
    }
  };
  const removing = dialog?.kind === 'removeProvider' || dialog?.kind === 'removeNode';
  const dialogTitle =
    dialog === null
      ? ''
      : dialog.kind === 'provider'
        ? t('nodes.addProvider')
        : dialog.kind === 'node'
          ? t('nodes.addNode')
          : dialog.kind === 'editNode'
            ? t('nodes.editNodeTitle', {name: dialog.entry.name})
            : dialog.kind === 'editProvider'
              ? t('nodes.editProviderTitle', {name: dialog.entry.tag})
              : t(dialog.kind === 'removeProvider' ? 'nodes.removeProviderTitle' : 'nodes.removeNodeTitle', {name: dialog.item.name});
  const agentKey = agentProblem(form.agent, false);
  const agentError = agentKey && t(agentKey);
  const intervalKey = intervalProblem(form.interval);
  const intervalError = intervalKey && t(intervalKey);
  // Removing a subscription, or renaming it where the write cannot carry every filter along, would leave the groups
  // whose filters name it matching nothing, or everything once a last filter goes, so both wait until those groups
  // are changed on the Policies page.
  const removal = subscriptionRemoval(config.data?.sources, config.loading, dialog?.kind === 'removeProvider' ? dialog.item : null);
  const blockedTag = dialog?.kind === 'removeProvider' && dialog.item.kind === 'subscription' ? dialog.item.name : subscriptionEdit.blockedTag;
  const blockers =
    dialog?.kind === 'editProvider' && blockedTag !== null
      ? [...new Set(sources.flatMap(item => groupsNamingTag(item.content, blockedTag)))]
      : removal.blockers;
  const checkingRemoval = removal.checking;
  const nodeState = dialog?.kind === 'editNode' ? nodeEditState(sources, dialog.source, dialog.entry, nodeList ?? [], form, t) : null;
  const nodeNameError = nodeState?.nameError ?? null;
  const nodeEditError = nodeState?.error ?? null;
  const formValid =
    dialog?.kind === 'editNode'
      ? nodeState!.valid
      : dialog?.kind === 'editProvider'
        ? subscriptionEdit.valid
        : dialog?.kind === 'provider'
          ? isBareName(form.name.trim()) && !!form.value.trim() && subscriptionUrlError(form.value, t) === null && !agentError && intervalSeconds !== null
          : dialog?.kind === 'node'
            ? form.name.trim() !== '' && !!form.value.trim() && nodeLinkError(form.value, t) === null
            : true;
  const subscription: SubscriptionDraft = {name: form.name, url: form.value, interval: form.interval, agent: form.agent, cache: form.cache, route: form.route};
  // A new subscription shows each option the backend lists, with its default preselected or as the placeholder; an
  // edit writes the options in the declaring source.
  const subscriptionFields: SubscriptionFieldSet = subscriptionEdit.fields ?? {
    interval: createOptions?.update_interval,
    agent: createOptions?.user_agent === undefined ? undefined : {fallback: createOptions.user_agent},
    cache: createOptions?.cache
  };
  const providerTable = useProviderTable({
    rows: list,
    loading: providers.loading && !providers.data,
    selected: selectedId,
    onSelect: id => {
      if (!id) return;
      const next = new URLSearchParams(query);
      next.set('provider', id);
      if (next.has('node') || next.has('nodes')) {
        next.delete('node');
        next.delete('nodes');
        next.delete('q');
      }
      // A source is always selected, so switching it rewrites the entry rather than stacking one per row.
      go('nodes', next.toString(), {replace: true});
    },
    canManage: !!resources?.providers.can_manage,
    canRefresh: !!resources?.providers.can_refresh,
    busy: !!manage.busy,
    source,
    entries,
    refresh: refreshing,
    refreshAll,
    onAdd: () => open({kind: 'provider'}),
    onRemove: item => open({kind: 'removeProvider', item}),
    inInclude: providerInInclude,
    editAction
  });
  const nodeTable = useNodeTable({
    nodes: owned,
    all: nodeList ?? [],
    sourceOf,
    providers: providers.data?.providers ?? [],
    names,
    loading: nodes.loading && !nodes.data,
    label: provider ? t('nodes.of', {name: provider.displayName ?? provider.name}) : t('nav.nodes'),
    scope: provider && list.length > 1 ? t('nodes.scope', {name: provider.displayName ?? provider.name}) : null,
    scopePending: providers.loading && !providers.data,
    multiple: list.length > 1,
    query: params.get('q'),
    groupQuery: params.get('group'),
    clearNodes: () => go('nodes', within(query, {node: null, nodes: null, q: null}), {replace: true}),
    nodeIds: (() => {
      try {
        const ids: unknown = JSON.parse(params.get('nodes') ?? '[]');
        return params.get('node') ? [params.get('node')!] : Array.isArray(ids) && ids.every(id => typeof id === 'string') ? ids : [];
      } catch {
        return [];
      }
    })(),
    source,
    joinable,
    canManage: !!resources?.nodes.can_manage,
    busy: !!manage.busy,
    reload: refetchNodes,
    joinGroup: joinExistingGroup,
    onAdd: addNode,
    onNewGroup: newGroup,
    onRemove: removeNode,
    inInclude: nodeInInclude,
    edit: nodeEdit
  });
  const tabs = nodesTabs(resources);
  return {
    tabs: tabs.map(tab => ({id: tab.id, label: t(tab.titleKey)})),
    tab: pickTab(
      query,
      tabs.map(tab => tab.id),
      'list'
    ),
    setTab: (next: string) => go('nodes', tabQuery(query, next, 'list')),
    providerTable,
    nodeTable,
    // No subscription and no node yet: the list gives way to a line saying so and Add subscription.
    noSources: noNodeSources(providers.data?.providers, nodes.data),
    addProvider: resources?.providers.can_manage ? () => open({kind: 'provider'}) : null,
    addNode: resources?.nodes.can_manage ? addNode : null,
    error: providers.error ?? nodes.error,
    reload,
    dialog,
    setDialog: (next: NodeDialog | null) => {
      session.next();
      setProblem(null);
      setDialog(next);
    },
    problem,
    form,
    setForm: (next: typeof form) => {
      if (submitting.current !== dialog) setForm(next);
    },
    removing,
    dialogTitle,
    formValid,
    nodeNameError,
    nodeLinkError: dialog?.kind === 'node' || dialog?.kind === 'editNode' ? nodeLinkError(form.value, t) : null,
    formReason:
      dialog?.kind === 'editNode'
        ? (nodeEditError ?? nodeFormReason('node', form.name, form.value, t))
        : dialog?.kind === 'editProvider'
          ? // A name error is shown on its field alone.
            subscriptionEdit.reason
          : nodeFormReason(dialog?.kind, form.name, form.value, t),
    submit,
    pending: dialog !== null && pendingDialog === dialog,
    // A write abandoned by Cancel still holds the node actions until it settles, so no dialog can submit meanwhile.
    submitting: pendingDialog !== null,
    submitLabel: removing
      ? t('nodes.remove', {name: dialog.item.name})
      : dialog?.kind === 'editProvider' || dialog?.kind === 'editNode'
        ? t('policy.save')
        : t('nodes.add'),
    editOptions: subscriptionEdit.options,
    renameGroups: subscriptionEdit.renameGroups,
    referenced: blockers.length && blockedTag !== null ? {groups: formatList(lang, blockers), name: blockedTag, href: href('policies')} : null,
    checkingRemoval,
    renameFrom: dialog?.kind === 'editProvider' ? dialog.entry.tag : '',
    updateGroups: subscriptionEdit.updateGroups,
    setUpdateGroups: (next: boolean) => {
      if (submitting.current !== dialog) subscriptionEdit.setUpdateGroups(next);
    },
    subscription,
    setSubscription: (next: SubscriptionDraft) => {
      if (submitting.current !== dialog) setForm({...form, ...next, value: next.url});
    },
    subscriptionFields,
    subscriptionErrors: {
      ...(dialog?.kind === 'editProvider' ? subscriptionEdit.errors : {name: null, agent: agentError, url: subscriptionUrlError(form.value, t)}),
      interval: intervalError
    }
  };
}
