import {useCallback, useMemo, useRef, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {useCapabilities, useNodeManage, useNodes, useOutboundNames, useProviderRefresh, useProviders} from '../../store';
import type {Node, Provider} from '../../api/model';
import {toast} from '../../ui/ui';
import {editProblem, useMainSourceEdit} from '../config/mainSource';
import {addNamesToGroup} from '../../dae/groups';
import type {PageProps} from '../types';
import {readSubscriptions} from './subscriptions';
import {ownedNodes, providerRows} from './view';
import {useProviderTable} from './useProviderTable';
import {useNodeTable} from './useNodeTable';
import {useDraftGuard} from '../config/useDraftGuard';
import {isSubscriptionUrl} from '../../dae/setup';
import {useLinked} from '../../ui/ui';
import {errorText} from '../../api/error';

type NodeDialog =
  {kind: 'provider'} | {kind: 'node'} | {kind: 'group'; item: Node} | {kind: 'removeProvider'; item: Provider} | {kind: 'removeNode'; item: Node};

export function useNodesPage({go, query}: PageProps) {
  const t = useT();
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [form, setForm] = useState({name: '', value: ''});
  const session = useRef(0);
  const submitting = useRef<NodeDialog | null>(null);
  const [pendingDialog, setPendingDialog] = useState<NodeDialog | null>(null);
  // Why the last submit did not land; `id` changes with each refusal so the alert takes focus again.
  const [problem, setProblem] = useState<{id: number; text: string} | null>(null);
  const guard = useDraftGuard(!!dialog && !!(form.name || form.value));
  useLinked(guard.revision, () => {
    session.current++;
    setDialog(null);
  });
  const open = useCallback((next: NodeDialog) => {
    session.current++;
    setForm({name: '', value: ''});
    setProblem(null);
    setDialog(next);
  }, []);
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(resources?.providers.available !== false);
  const nodes = useNodes(resources?.nodes.available !== false);
  const names = useOutboundNames();
  const {refetch: refetchProviders} = providers;
  const {refetch: refetchNodes} = nodes;
  const reload = useCallback(() => {
    refetchProviders();
    refetchNodes();
  }, [refetchProviders, refetchNodes]);
  const manage = useNodeManage(reload);
  const refreshing = useProviderRefresh(reload);
  const source = useMainSourceEdit();
  const entries = useMemo(() => readSubscriptions(source.main?.content ?? ''), [source.main?.content]);
  const {list} = useMemo(() => providerRows(providers.data?.providers ?? [], nodes.data ?? [], entries, t), [providers.data, nodes.data, entries, t]);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  // Default to the first real source: the built-in and unattributed rows only lead when nothing else exists.
  const selectedId = params.get('provider') ?? (list.find(item => item.kind !== 'builtin' && item.kind !== 'unattributed') ?? list[0])?.id ?? null;
  const provider = list.find(item => item.id === selectedId) ?? null;
  const owned = useMemo(() => {
    const owner = list.find(item => item.id === selectedId);
    return ownedNodes(nodes.data ?? [], owner?.kind === 'builtin' || owner?.kind === 'unattributed' ? null : owner?.id, owner?.kind);
  }, [nodes.data, list, selectedId]);
  const {apply} = source;
  const joinExistingGroup = useCallback(
    (node: Node, group: string) => {
      void apply(text => addNamesToGroup(text, group, [node.name])).then(result => {
        if (result.kind === 'ok') toast('positive', t('nodes.joined', {name: node.name, group}));
        const problem = editProblem(result, 'nodes.writeInvalid', t);
        if (problem) toast('negative', problem);
      });
    },
    [apply, t]
  );
  const addNode = useCallback(() => open({kind: 'node'}), [open]);
  const newGroup = useCallback((item: Node) => open({kind: 'group', item}), [open]);
  const removeNode = useCallback((item: Node) => open({kind: 'removeNode', item}), [open]);
  const submit = async (close: () => void) => {
    if (!dialog || submitting.current) return;
    submitting.current = dialog;
    setPendingDialog(dialog);
    const submitted = session.current;
    // A refusal after the dialog closed has nowhere inline to go.
    const refuse = (text: string) => {
      if (session.current === submitted) setProblem(prev => ({id: (prev?.id ?? 0) + 1, text}));
      else toast('negative', text);
    };
    try {
      if (dialog.kind === 'provider') {
        // The backend's label for a subscription may be opaque; the toast names it as the user did.
        const created = await manage.addProvider({name: form.name.trim(), kind: 'subscription', url: form.value.trim()});
        if (!created) return;
        const name = form.name.trim();
        // The contract creates the provider unfetched; a refresh is what turns it into nodes.
        if (resources?.providers.can_refresh) {
          if (session.current === submitted) {
            guard.clear();
            close();
          }
          void refreshing.refresh(created.id).then(
            result => {
              if (result) toast('positive', t('nodes.addedRefreshed', {name, n: formatNumber(result.node_count, locale)}));
            },
            error => toast('negative', t('nodes.addedRefreshFailed', {name, error: errorText(error, t)}))
          );
          return;
        }
        toast('positive', t('nodes.added', {name}));
      } else if (dialog.kind === 'node') {
        const created = await manage.addNode({name: form.name.trim(), link: form.value.trim()});
        if (!created) return;
        toast('positive', t('nodes.added', {name: created.name}));
      } else if (dialog.kind === 'group') {
        const group = form.name.trim();
        const result = await apply(text => addNamesToGroup(text, group, [dialog.item.name]));
        const text = editProblem(result, 'nodes.writeInvalid', t);
        if (text) refuse(text);
        if (result.kind !== 'ok') return;
        toast('positive', t('nodes.joined', {name: dialog.item.name, group}));
      } else if (dialog.kind === 'removeProvider') {
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
      refuse(errorText(error, t));
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
          : dialog.kind === 'group'
            ? t('nodes.newGroup')
            : t(dialog.kind === 'removeProvider' ? 'nodes.removeProviderTitle' : 'nodes.removeNodeTitle', {name: dialog.item.name});
  const formValid =
    dialog?.kind === 'provider'
      ? /^[\w.-]+$/.test(form.name.trim()) && isSubscriptionUrl(form.value)
      : dialog?.kind === 'node'
        ? form.name.trim() !== '' && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(form.value.trim())
        : dialog?.kind === 'group'
          ? form.name.trim() !== '' && !form.name.includes('{') && !form.name.includes('}')
          : true;
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
    onAdd: () => open({kind: 'provider'}),
    onRemove: item => open({kind: 'removeProvider', item})
  });
  const nodeTable = useNodeTable({
    nodes: owned,
    providers: providers.data?.providers ?? [],
    names,
    loading: nodes.loading && !nodes.data,
    label: provider ? t('nodes.of', {name: provider.displayName ?? provider.name}) : t('nav.nodes'),
    query: params.get('q'),
    source,
    canManage: !!resources?.nodes.can_manage,
    busy: !!manage.busy,
    reload: refetchNodes,
    joinGroup: joinExistingGroup,
    onAdd: addNode,
    onNewGroup: newGroup,
    onRemove: removeNode
  });
  return {
    providerTable,
    nodeTable,
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
    submit,
    pending: dialog !== null && pendingDialog === dialog,
    submitLabel: removing ? t('nodes.remove', {name: dialog.item.name}) : dialog?.kind === 'group' ? t('nodes.join') : t('nodes.add'),
    groupHelp: dialog?.kind === 'group' ? t('nodes.newGroupHelp', {name: dialog.item.name}) : ''
  };
}
