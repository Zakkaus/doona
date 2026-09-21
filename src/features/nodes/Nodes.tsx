import {useCallback, useState} from 'react';
import {useT} from '../../i18n';
import {Button, DataTable, ErrorMessage, LabeledSelect, ModalDialog, TextField, toast} from '../../ui/ui';
import type {PageProps} from '../types';
import {fail, useNodesController, type NodeDialog} from './useNodesController';

export function Nodes({go, query}: PageProps) {
  const t = useT();
  const [dialog, setDialog] = useState<NodeDialog | null>(null);
  const [form, setForm] = useState({name: '', value: ''});
  const open = useCallback((next: NodeDialog) => {
    setForm({name: '', value: ''});
    setDialog(next);
  }, []);
  const {
    providers,
    nodes,
    reload,
    manage,
    source,
    joinGroup,
    n,
    names,
    list,
    selectedId,
    provider,
    select,
    search,
    setSearch,
    group,
    setGroup,
    protocol,
    setProtocol,
    sort,
    setSort,
    owned,
    groups,
    protocols,
    members,
    canManageProviders,
    canManageNodes,
    providerColumns,
    nodeColumns,
    renderProvider,
    renderNode
  } = useNodesController({go, query}, open);
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
  // What the dialog is about: its title, whether it adds or removes, and when its form is complete.
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
  return (
    <div className="rp-page">
      <p className="rp-note">{t('nodes.note')}</p>
      <ErrorMessage error={providers.error ?? nodes.error} onRetry={reload} />
      {canManageProviders && (
        <div className="rp-toolbar">
          <span className="rp-grow" />
          <Button small onPress={() => open({kind: 'provider'})}>
            {t('nodes.addProvider')}
          </Button>
        </div>
      )}
      <DataTable
        label={t('nodes.providers')}
        loading={providers.loading && !providers.data}
        rows={list}
        height={280}
        selected={selectedId}
        onSelect={select}
        selectOnFocus
        empty={t('nodes.noProviders')}
        cols={providerColumns}
        render={renderProvider}
      />
      <div className="rp-toolbar">
        <TextField label={t('nodes.search')} search value={search} width={220} onChange={setSearch} />
        <LabeledSelect
          label={t('nodes.group')}
          side
          value={group}
          onChange={setGroup}
          items={[{id: '', label: t('nodes.anyGroup')}, ...groups.map(id => ({id, label: names.get(id) ?? id}))]}
        />
        <LabeledSelect
          label={t('nodes.protocol')}
          side
          value={protocol}
          onChange={setProtocol}
          items={[{id: '', label: t('nodes.anyProtocol')}, ...protocols.map(id => ({id, label: id}))]}
        />
        <span className="rp-label">{t('nodes.shown', {n: n(members.length), total: n(owned.length)})}</span>
        <span className="rp-grow" />
        {canManageNodes && (
          <Button small onPress={() => open({kind: 'node'})}>
            {t('nodes.addNode')}
          </Button>
        )}
      </div>
      <DataTable
        label={provider ? t('nodes.of', {name: provider.name}) : t('nav.nodes')}
        loading={nodes.loading && !nodes.data}
        rows={members}
        height={520}
        empty={t('nodes.empty')}
        sort={sort}
        onSort={setSort}
        cols={nodeColumns}
        render={renderNode}
      />
      <ModalDialog
        title={dialogTitle}
        narrow
        alert={removing}
        isOpen={dialog !== null}
        onOpenChange={isOpen => {
          if (!isOpen) setDialog(null);
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button
              accent={!removing}
              negative={removing}
              isDisabled={!formValid}
              isPending={!!manage.busy || (dialog?.kind === 'group' && source.busy)}
              onPress={() => void submit(close)}
            >
              {removing ? t('nodes.remove', {name: dialog.item.name}) : dialog?.kind === 'group' ? t('nodes.join') : t('nodes.add')}
            </Button>
          </>
        )}
      >
        {dialog?.kind === 'provider' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addProviderHelp')}</span>
            <TextField label={t('nodes.name')} value={form.name} placeholder="sub-a" onChange={name => setForm({...form, name})} />
            <TextField label={t('nodes.url')} value={form.value} placeholder="https://example.org/sub?token=…" onChange={value => setForm({...form, value})} />
          </div>
        )}
        {dialog?.kind === 'group' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.newGroupHelp', {name: dialog.item.name})}</span>
            <TextField label={t('nodes.name')} value={form.name} placeholder="hk" onChange={name => setForm({...form, name})} />
          </div>
        )}
        {dialog?.kind === 'node' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addNodeHelp')}</span>
            <TextField label={t('nodes.name')} value={form.name} placeholder="hk-03" onChange={name => setForm({...form, name})} />
            <TextField label={t('nodes.link')} value={form.value} placeholder="vless://…" onChange={value => setForm({...form, value})} />
          </div>
        )}
        {dialog?.kind === 'removeProvider' && <span className="rp-label">{t('nodes.removeProviderHelp')}</span>}
        {dialog?.kind === 'removeNode' && <span className="rp-label">{t('nodes.removeNodeHelp')}</span>}
      </ModalDialog>
    </div>
  );
}
