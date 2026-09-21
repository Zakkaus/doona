import {useCallback, useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {useCapabilities, useNodeManage, useNodes, useOutboundNames, useProviders} from '../../api/store';
import type {Node, Provider} from '../../api/model';
import {errorText, toast} from '../../ui/ui';
import {useMainSourceEdit} from '../config/mainSource';
import {addNamesToGroup} from '../config/groups';
import type {PageProps} from '../types';
import {readSubscriptions} from './subscriptions';
import {ownedNodes, providerRows} from './view';
import {useProviderTable} from './useProviderTable';
import {useNodeTable} from './useNodeTable';

type NodeDialog =
  {kind: 'provider'} | {kind: 'node'} | {kind: 'group'; item: Node} | {kind: 'removeProvider'; item: Provider} | {kind: 'removeNode'; item: Node};
const fail = (error: unknown) => toast('negative', errorText(error));

export function useNodesPage({go, query}: PageProps) {
  const t = useT();
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [form, setForm] = useState({name: '', value: ''});
  const open = useCallback((next: NodeDialog) => {
    setForm({name: '', value: ''});
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
  const source = useMainSourceEdit();
  const entries = useMemo(() => readSubscriptions(source.main?.content ?? ''), [source.main?.content]);
  const {list} = useMemo(() => providerRows(providers.data?.providers ?? [], nodes.data ?? [], entries, t), [providers.data, nodes.data, entries, t]);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const selectedId = params.get('provider') ?? list[0]?.id ?? null;
  const provider = list.find(item => item.id === selectedId) ?? null;
  const owned = useMemo(() => {
    const owner = list.find(item => item.id === selectedId);
    return ownedNodes(nodes.data ?? [], owner?.kind === 'builtin' || owner?.kind === 'unattributed' ? null : owner?.id, owner?.kind);
  }, [nodes.data, list, selectedId]);
  const joinGroup = (node: Node, group: string) => {
    void source
      .apply(
        text => addNamesToGroup(text, group, [node.name]),
        errors => toast('negative', t('nodes.writeInvalid', {n: formatNumber(errors, locale)}))
      )
      .then(written => {
        if (written) toast('positive', t('nodes.joined', {name: node.name, group}));
      }, fail);
  };
  const submit = async (close: () => void) => {
    if (!dialog) return;
    try {
      if (dialog.kind === 'provider') {
        // The backend's label for a subscription may be opaque; the toast names it as the user did.
        const created = await manage.addProvider({name: form.name.trim(), kind: 'subscription', url: form.value.trim()});
        if (created) toast('positive', t('nodes.added', {name: form.name.trim()}));
      } else if (dialog.kind === 'node') {
        const created = await manage.addNode({name: form.name.trim(), link: form.value.trim()});
        if (created) toast('positive', t('nodes.added', {name: created.name}));
      } else if (dialog.kind === 'group') {
        joinGroup(dialog.item, form.name.trim());
      } else if (dialog.kind === 'removeProvider') {
        if (await manage.removeProvider(dialog.item.id)) toast('positive', t('nodes.removed', {name: dialog.item.name}));
      } else if (await manage.removeNode(dialog.item.id)) toast('positive', t('nodes.removed', {name: dialog.item.name}));
      close();
    } catch (error) {
      fail(error);
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
      ? /^[\w.-]+$/.test(form.name.trim()) && /^https?:\/\/\S+$/.test(form.value.trim())
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
      go('nodes', next.toString());
    },
    canManage: !!resources?.providers.can_manage,
    canRefresh: !!resources?.providers.can_refresh,
    busy: !!manage.busy,
    source,
    entries,
    reload,
    onAdd: () => open({kind: 'provider'}),
    onRemove: item => open({kind: 'removeProvider', item})
  });
  const nodeTable = useNodeTable({
    nodes: owned,
    providers: providers.data?.providers ?? [],
    names,
    loading: nodes.loading && !nodes.data,
    label: provider ? t('nodes.of', {name: provider.name}) : t('nav.nodes'),
    query: params.get('q'),
    source,
    canManage: !!resources?.nodes.can_manage,
    busy: !!manage.busy,
    reload: refetchNodes,
    joinGroup,
    onAdd: () => open({kind: 'node'}),
    onNewGroup: item => open({kind: 'group', item}),
    onRemove: item => open({kind: 'removeNode', item})
  });
  return {
    providerTable,
    nodeTable,
    error: providers.error ?? nodes.error,
    reload,
    dialog,
    setDialog,
    form,
    setForm,
    removing,
    dialogTitle,
    formValid,
    submit,
    pending: !!manage.busy || (dialog?.kind === 'group' && source.busy),
    submitLabel: removing ? t('nodes.remove', {name: dialog.item.name}) : dialog?.kind === 'group' ? t('nodes.join') : t('nodes.add'),
    groupHelp: dialog?.kind === 'group' ? t('nodes.newGroupHelp', {name: dialog.item.name}) : ''
  };
}
