import {useT} from '../../i18n';
import {Button, ConfirmDialog, ErrorMessage, InlineAlert, ModalDialog, Tabs, TextField} from '../../ui/ui';
import {NodeLatency} from './Latency';
import type {PageProps} from '../../shell/routes';
import {ProviderTable} from './ProviderTable';
import {NodeTable} from './NodeTable';
import {useNodesPage} from './useNodesPage';
import {PolicyPicker} from '../policies/PolicyPicker';
export function Nodes(props: PageProps) {
  const t = useT();
  const {
    measured,
    tab,
    setTab,
    providerTable,
    nodeTable,
    error,
    reload,
    dialog,
    setDialog,
    problem,
    form,
    setForm,
    removing,
    dialogTitle,
    formValid,
    submit,
    pending,
    submitting,
    submitLabel,
    groupHelp,
    groupNameError,
    policy,
    setPolicy
  } = useNodesPage(props);
  const list = (
    <>
      <ErrorMessage error={error} onRetry={reload} />
      <ProviderTable model={providerTable} />
      <NodeTable model={nodeTable} />
    </>
  );
  return (
    <div className="rp-page">
      <p className="rp-note">{t('nodes.note')}</p>
      {measured ? (
        <Tabs
          keepMounted
          label={t('nav.nodes')}
          value={tab}
          onChange={setTab}
          items={[
            {id: 'list', label: t('nodes.tab.list'), content: list},
            {id: 'latency', label: t('nodes.tab.latency'), content: <NodeLatency />}
          ]}
        />
      ) : (
        list
      )}
      {/* Cancel stays live while the write is pending; a result that lands afterwards arrives as a toast. */}
      <ModalDialog
        title={dialogTitle}
        narrow
        isOpen={dialog !== null && !removing}
        onOpenChange={isOpen => {
          if (!isOpen) setDialog(null);
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button accent isDisabled={!formValid || submitting} isPending={pending} onPress={() => void submit(close)}>
              {submitLabel}
            </Button>
          </>
        )}
      >
        {problem && (
          <InlineAlert key={problem.id} takeFocus>
            {problem.text}
          </InlineAlert>
        )}
        {dialog?.kind === 'provider' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addProviderHelp')}</span>
            <TextField isDisabled={pending} label={t('nodes.name')} value={form.name} placeholder="sub-a" onChange={name => setForm({...form, name})} />
            <TextField
              isDisabled={pending}
              label={t('nodes.url')}
              value={form.value}
              placeholder="https://example.org/sub?token=…"
              onChange={value => setForm({...form, value})}
            />
          </div>
        )}
        {dialog?.kind === 'group' && (
          <div className="rp-list">
            <span className="rp-label">{groupHelp}</span>
            <TextField
              isDisabled={pending}
              label={t('nodes.name')}
              value={form.name}
              placeholder="hk"
              spellCheck={false}
              description={t('arrange.groupNameHint')}
              error={groupNameError ?? undefined}
              onChange={name => setForm({...form, name})}
            />
            <PolicyPicker value={policy} onChange={setPolicy} isDisabled={pending} />
          </div>
        )}
        {dialog?.kind === 'node' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addNodeHelp')}</span>
            <TextField isDisabled={pending} label={t('nodes.name')} value={form.name} placeholder="hk-03" onChange={name => setForm({...form, name})} />
            <TextField isDisabled={pending} label={t('nodes.link')} value={form.value} placeholder="vless://…" onChange={value => setForm({...form, value})} />
          </div>
        )}
      </ModalDialog>
      <ConfirmDialog
        title={dialogTitle}
        isOpen={removing}
        onCancel={() => setDialog(null)}
        confirmLabel={submitLabel}
        isPending={pending}
        isDisabled={submitting}
        error={problem}
        onConfirm={() => void submit(() => setDialog(null))}
      >
        <p className="rp-label">{t(dialog?.kind === 'removeProvider' ? 'nodes.removeProviderHelp' : 'nodes.removeNodeHelp')}</p>
      </ConfirmDialog>
    </div>
  );
}
