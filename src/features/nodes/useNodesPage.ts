import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useT, useLang, formatList} from '../../i18n';
import {useCapabilities, useNodeManage, useNodes, useOutboundNames, useProviderRefresh, useProviders, useVersion} from '../../store';
import {useCompleteness, useConfig} from '../../store/config';
import type {ConfigSource, Node, Provider} from '../../api/model';
import {toast, toastFailure} from '../../ui/ui';
import {editProblem, useMainSourceEdit} from '../../store/mainSource';
import {isWritableName, addSubtagsToGroup, citingGroups, groupsNamingTag, readGroupEntries, removeSubtagsFromGroup} from '../../dae/groups';
import {isBareName, isQuotable} from '../../dae/text';
import {agentProblem, isSubscriptionUrl, readSubscriptionEntries, urlHost, writeSubscriptionEntry, type SubscriptionText} from '../../dae/subscriptions';
import {engineOf} from '../../api/engines';
import type {PageProps} from '../../shell/routes';
import {replaceRoute} from '../../shell/route';
import {
  isNodeLink,
  keptOptions,
  nodeFormReason,
  nodeSource,
  ownedNodes,
  providerCreate,
  providerRows,
  renameReferences,
  selectedProvider,
  type ProviderForm,
  type ProviderRow
} from './view';
import {useProviderTable} from './useProviderTable';
import {useRefreshAll} from '../shared/useRefreshAll';
import {useNodeTable} from './useNodeTable';
import {useDraftGuard} from '../../shell/draft';
import {errorText, noticeText, requestIdOf, type Notice} from '../../api/error';
import {href, pickTab, tabQuery, within} from '../../shell/route';
import {noNodeSources} from '../../api/selectors';
import {offered} from '../../api/capabilities';
import {nodesTabs} from './nav';
import type {SubscriptionDraft, SubscriptionFieldSet} from '../shared/SubscriptionFields';

const blank: ProviderForm = {name: '', value: '', interval: '', agent: '', cache: null, route: ''};

type NodeDialog =
  | {kind: 'provider'}
  | {kind: 'node'}
  | {kind: 'removeProvider'; item: Provider}
  | {kind: 'removeNode'; item: Node}
  | {kind: 'editProvider'; item: ProviderRow; source: ConfigSource; entry: SubscriptionText};

export function useNodesPage({go, query}: PageProps) {
  const t = useT();
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [form, setForm] = useState<ProviderForm>(blank);
  const [updateGroups, setUpdateGroups] = useState(true);
  const session = useRef(0);
  const submitting = useRef<NodeDialog | null>(null);
  const [pendingDialog, setPendingDialog] = useState<NodeDialog | null>(null);
  // Why the last submit did not land; `id` changes with each refusal so the alert takes focus again.
  const [problem, setProblem] = useState<{id: number; text: string} | null>(null);
  const edited =
    dialog?.kind === 'editProvider'
      ? form.name !== dialog.entry.tag ||
        form.value !== dialog.entry.url ||
        form.agent !== (dialog.entry.ua ?? '') ||
        form.cache !== null ||
        form.route !== (dialog.entry.route ?? '')
      : !!(form.name || form.value);
  const guard = useDraftGuard(!!dialog && edited, () => {
    session.current++;
    setDialog(null);
  });
  const open = useCallback((next: NodeDialog) => {
    session.current++;
    setForm(blank);
    setUpdateGroups(true);
    setProblem(null);
    if (next.kind === 'editProvider')
      setForm({...blank, name: next.entry.tag, value: next.entry.url, agent: next.entry.ua ?? '', route: next.entry.route ?? ''});
    setDialog(next);
  }, []);
  const lang = useLang();
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(offered(resources, 'providers', {whileLoading: true}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: true}));
  const names = useOutboundNames();
  const {refetch: refetchProviders} = providers;
  const {refetch: refetchNodes} = nodes;
  const reload = useCallback(() => {
    refetchProviders();
    refetchNodes();
  }, [refetchProviders, refetchNodes]);
  const manage = useNodeManage(reload);
  const refreshing = useProviderRefresh(reload);
  const refreshAll = useRefreshAll(providers, refreshing);
  const source = useMainSourceEdit();
  // A subscription is edited in whichever source declares it, and only in dae text this page knows how to write.
  const daeText = engineOf(useVersion().data).daeText;
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const isComplete = useCompleteness(sources);
  const declared = useMemo(() => {
    const found = new Map<string, Array<{source: ConfigSource; entry: SubscriptionText}>>();
    for (const item of sources)
      for (const entry of readSubscriptionEntries(item.content)) found.set(entry.tag, [...(found.get(entry.tag) ?? []), {source: item, entry}]);
    return found;
  }, [sources]);
  // The source is read again after a refused save, so the next save writes the entry as it is written now; null once
  // no source, or more than one, declares it.
  const editing = dialog?.kind === 'editProvider' ? declared.get(dialog.entry.tag) : undefined;
  const editSource = editing?.length === 1 ? editing[0].source : null;
  const editAction = (item: ProviderRow) => {
    const place = item.sourceTag ? declared.get(item.sourceTag) : undefined;
    if (!place?.length) return null;
    // honk lets two subscriptions share a name, such as a tagged entry and an untagged one named after the same host;
    // the entry found by that name may then declare the other one, so it only opens, at the entry on the row's host
    // when one alone matches.
    const own = place.length > 1 ? place.filter(({entry}) => urlHost(entry.url) === urlHost(item.url_redacted)) : place;
    const {source: origin, entry} = own.length === 1 ? own[0] : place[0];
    const unique =
      place.length === 1 && (providers.data?.providers ?? []).filter(other => other.kind === 'subscription' && other.name === item.name).length === 1;
    // A source whose listener secrets came back masked would be saved with the masks, so it only opens.
    if (daeText && unique && source.writable && origin.writable && isComplete(origin) === true)
      return {kind: 'edit' as const, run: () => open({kind: 'editProvider', item, source: origin, entry})};
    return {kind: 'open' as const, run: () => go('config', within('', {tab: 'source', source: origin.id, line: String(entry.line)}))};
  };
  const entries = useMemo(() => readSubscriptionEntries(source.main?.content ?? ''), [source.main?.content]);
  const {list} = useMemo(() => providerRows(providers.data?.providers ?? [], nodes.data ?? [], entries, t), [providers.data, nodes.data, entries, t]);
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
  const selectedId = selectedProvider(list, params.get('provider'));
  const provider = list.find(item => item.id === selectedId) ?? null;
  const owned = useMemo(() => {
    const owner = list.find(item => item.id === selectedId);
    return ownedNodes(nodes.data ?? [], owner?.kind === 'builtin' || owner?.kind === 'unattributed' ? null : owner?.id, owner?.kind);
  }, [nodes.data, list, selectedId]);
  const sourceOf = useMemo(() => nodeSource(list, providers.data?.providers ?? []), [list, providers.data]);
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
  const newGroup = (node: Node) => {
    if (!isWritableName(node.name)) {
      toast('negative', t('config.unquotable'));
      return;
    }
    go('policies', within('', {new: '1', node: node.name}));
  };
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
    const submitted = session.current;
    const at = shown.current;
    // A refusal after the dialog closed has nowhere inline to go.
    const refuse = (text: string, toastText = text, requestId?: string) => {
      if (session.current === submitted) setProblem(prev => ({id: (prev?.id ?? 0) + 1, text}));
      else toast('negative', toastText, {requestId});
    };
    const refuseNotice = (problem: Notice) => refuse(noticeText(problem, t), noticeText(problem, t, false), problem.requestId);
    try {
      if (dialog.kind === 'provider') {
        // The backend's label for a subscription may be opaque; the toast names it as the user did.
        const created = await manage.addProvider(providerCreate(form, createOptions));
        if (!created) return;
        const name = form.name.trim();
        if (session.current === submitted) {
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
                if ('degraded' in result) toast('info', t('nodes.refreshedDegraded', {name}), {action: viewNodes(created.id)});
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
      } else if (dialog.kind === 'editProvider') {
        const from = dialog.entry.tag;
        const tag = form.name.trim();
        const url = form.value.trim();
        const follow = tag !== from && updateGroups;
        if (!editSource) {
          refuse(t(declared.get(from)?.length ? 'nodes.tagTaken' : 'nodes.editMissing'));
          return;
        }
        // Filters are read from the text being written, so a group changed meanwhile is still found.
        const result = await apply(text => {
          const written = writeSubscriptionEntry(text, from, {
            tag,
            url,
            ...(form.agent !== (dialog.entry.ua ?? '') ? {ua: form.agent.trim() || null} : {}),
            ...(editCache.changed ? {cache: editCache.value} : {}),
            // Following the routing rules is honk's default, so choosing it removes the route.
            ...(routeChanged ? {route: editRoute === 'routing' ? null : editRoute} : {})
          });
          if (!follow) return written;
          return citingGroups(written, from).reduce((out, group) => removeSubtagsFromGroup(addSubtagsToGroup(out, group, [tag]), group, [from]), written);
        }, editSource);
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
      if (session.current === submitted) {
        guard.clear();
        close();
      }
    } catch (error) {
      refuse(errorText(error, t), errorText(error, t, false), requestIdOf(error));
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
          : dialog.kind === 'editProvider'
            ? t('nodes.editProviderTitle', {name: dialog.entry.tag})
            : t(dialog.kind === 'removeProvider' ? 'nodes.removeProviderTitle' : 'nodes.removeNodeTitle', {name: dialog.item.name});
  const createOptions = resources?.providers.create_options;
  const agentKey = agentProblem(form.agent, false);
  const agentError = agentKey && t(agentKey);
  // An entry's own User-Agent must also be written back as a quoted value; empty removes it, leaving the engine default.
  const editAgentKey = agentProblem(form.agent, true);
  const editAgentError = editAgentKey && t(editAgentKey);
  // The switch shows the entry's cache, or the default a new subscription gets when the entry sets none.
  const writtenCache = dialog?.kind === 'editProvider' ? (dialog.entry.cache ?? createOptions?.cache) : undefined;
  const editCache = {value: form.cache ?? writtenCache ?? null, changed: form.cache !== null && form.cache !== writtenCache};
  // A kept name is valid as written; a new one is bare, as doona writes names, and free among the subscriptions.
  const editName = form.name.trim();
  const editNameError =
    dialog?.kind !== 'editProvider' || editName === dialog.entry.tag || !editName
      ? null
      : !isBareName(editName)
        ? t('nodes.nameInvalid')
        : declared.has(editName)
          ? t('nodes.tagTaken')
          : null;
  const editRoute = form.route || 'routing';
  const routeChanged = dialog?.kind === 'editProvider' && editRoute !== (dialog.entry.route || 'routing');
  const editUrlValid = isSubscriptionUrl(form.value) && isQuotable(form.value.trim());
  const references =
    dialog?.kind === 'editProvider' && editName !== dialog.entry.tag
      ? renameReferences(sources, editSource ?? dialog.source, dialog.entry.tag)
      : {here: [], elsewhere: []};
  // Removing a subscription, or renaming it where the write cannot carry every filter along, would leave the groups
  // whose filters name it matching nothing, or everything once a last filter goes, so both wait until those groups
  // are changed on the Policies page.
  const namingGroups = (tag: string) => [...new Set(sources.flatMap(item => groupsNamingTag(item.content ?? '', tag)))];
  const blockedTag =
    dialog?.kind === 'removeProvider' && dialog.item.kind === 'subscription'
      ? dialog.item.name
      : dialog?.kind === 'editProvider' && references.elsewhere.length
        ? dialog.entry.tag
        : null;
  const blockers = blockedTag === null ? [] : namingGroups(blockedTag);
  // A removal waits for the configuration that says whether any group names the subscription.
  const checkingRemoval = dialog?.kind === 'removeProvider' && dialog.item.kind === 'subscription' && config.loading && !config.data;
  const formValid =
    dialog?.kind === 'editProvider'
      ? !!editName &&
        editNameError === null &&
        editUrlValid &&
        editAgentError === null &&
        !references.elsewhere.length &&
        (editName !== dialog.entry.tag ||
          form.value.trim() !== dialog.entry.url ||
          (form.agent !== (dialog.entry.ua ?? '') && (form.agent.trim() || null) !== dialog.entry.ua) ||
          editCache.changed ||
          routeChanged)
      : dialog?.kind === 'provider'
        ? isBareName(form.name.trim()) && isSubscriptionUrl(form.value) && !agentError
        : dialog?.kind === 'node'
          ? form.name.trim() !== '' && isNodeLink(form.value)
          : true;
  const subscription: SubscriptionDraft = {name: form.name, url: form.value, interval: form.interval, agent: form.agent, cache: form.cache, route: form.route};
  const groupsEverywhere = [...new Set(sources.flatMap(item => readGroupEntries(item.content ?? '').map(entry => entry.name)))];
  // A new subscription shows each option the backend lists, with its default preselected or as the placeholder; an
  // edit writes the entry's own User-Agent and cache, and leaves the interval to the table's picker.
  const subscriptionFields: SubscriptionFieldSet =
    dialog?.kind === 'editProvider'
      ? {
          agent: {fallback: createOptions?.user_agent, description: t('nodes.agentDefault')},
          cache: writtenCache,
          // An engine that fetches subscriptions only directly leaves the route out of its providers.
          routes: dialog.item.download === undefined ? undefined : groupsEverywhere
        }
      : {
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
      // A source is always selected, so switching it rewrites the entry rather than stacking one per row.
      go('nodes', next.toString(), {replace: true});
    },
    canManage: !!resources?.providers.can_manage,
    canRefresh: !!resources?.providers.can_refresh,
    busy: !!manage.busy,
    source,
    entries,
    reload,
    refresh: refreshing,
    refreshAll,
    onAdd: () => open({kind: 'provider'}),
    onRemove: item => open({kind: 'removeProvider', item}),
    editAction
  });
  const nodeTable = useNodeTable({
    nodes: owned,
    all: nodes.data ?? [],
    sourceOf,
    providers: providers.data?.providers ?? [],
    names,
    loading: nodes.loading && !nodes.data,
    label: provider ? t('nodes.of', {name: provider.displayName ?? provider.name}) : t('nav.nodes'),
    scope: provider && list.length > 1 ? t('nodes.scope', {name: provider.displayName ?? provider.name}) : null,
    multiple: list.length > 1,
    query: params.get('q'),
    groupQuery: params.get('group'),
    source,
    canManage: !!resources?.nodes.can_manage,
    busy: !!manage.busy,
    reload: refetchNodes,
    joinGroup: joinExistingGroup,
    onAdd: addNode,
    onNewGroup: newGroup,
    onRemove: removeNode
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
      session.current++;
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
    formReason:
      dialog?.kind === 'editProvider'
        ? !editName
          ? t('nodes.nameMissing')
          : // A name error is shown on its field alone.
            editUrlValid
            ? null
            : t('nodes.urlInvalid')
        : nodeFormReason(dialog?.kind, form.name, form.value, t),
    submit,
    pending: dialog !== null && pendingDialog === dialog,
    // A write abandoned by Cancel still holds the node actions until it settles, so no dialog can submit meanwhile.
    submitting: pendingDialog !== null,
    submitLabel: removing ? t('nodes.remove', {name: dialog.item.name}) : dialog?.kind === 'editProvider' ? t('policy.save') : t('nodes.add'),
    editOptions:
      dialog?.kind === 'editProvider' ? keptOptions(dialog.entry.options, {cache: writtenCache !== undefined, route: !!subscriptionFields.routes}) : [],
    // Renaming offers to carry the groups whose subtag filter names the old tag along in the same write,
    // unless another source or an expression names it too: a write across sources is not atomic, so the rename waits.
    renameGroups: references.here.length && !references.elsewhere.length ? formatList(lang, references.here) : null,
    referenced: blockers.length && blockedTag !== null ? {groups: formatList(lang, blockers), name: blockedTag, href: href('policies')} : null,
    checkingRemoval,
    renameFrom: dialog?.kind === 'editProvider' ? dialog.entry.tag : '',
    updateGroups,
    setUpdateGroups: (next: boolean) => {
      if (submitting.current !== dialog) setUpdateGroups(next);
    },
    subscription,
    setSubscription: (next: SubscriptionDraft) => {
      if (submitting.current !== dialog) setForm({...form, ...next, value: next.url});
    },
    subscriptionFields,
    subscriptionErrors: dialog?.kind === 'editProvider' ? {name: editName ? editNameError : null, agent: editAgentError} : {name: null, agent: agentError}
  };
}
