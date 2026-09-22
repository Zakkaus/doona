import {useT} from '../../i18n';
import {Button, ErrorMessage, ModalDialog, TextField} from '../../ui/ui';
import type {PageProps} from '../types';
import {ProviderTable} from './ProviderTable';
import {NodeTable} from './NodeTable';
import {useNodesPage} from './useNodesPage';
export function Nodes(props: PageProps) {
  const t = useT();
  const {providerTable, nodeTable, error, reload, dialog, setDialog, form, setForm, removing, dialogTitle, formValid, submit, pending, submitLabel, groupHelp} =
    useNodesPage(props);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('nodes.note')}</p>
      <ErrorMessage error={error} onRetry={reload} />
      <ProviderTable model={providerTable} />
      <NodeTable model={nodeTable} />
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
            <Button accent={!removing} negative={removing} isDisabled={!formValid} isPending={pending} onPress={() => void submit(close)}>
              {submitLabel}
            </Button>
          </>
        )}
      >
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
            <TextField isDisabled={pending} label={t('nodes.name')} value={form.name} placeholder="hk" onChange={name => setForm({...form, name})} />
          </div>
        )}
        {dialog?.kind === 'node' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addNodeHelp')}</span>
            <TextField isDisabled={pending} label={t('nodes.name')} value={form.name} placeholder="hk-03" onChange={name => setForm({...form, name})} />
            <TextField isDisabled={pending} label={t('nodes.link')} value={form.value} placeholder="vless://…" onChange={value => setForm({...form, value})} />
          </div>
        )}
        {dialog?.kind === 'removeProvider' && <span className="rp-label">{t('nodes.removeProviderHelp')}</span>}
        {dialog?.kind === 'removeNode' && <span className="rp-label">{t('nodes.removeNodeHelp')}</span>}
      </ModalDialog>
    </div>
  );
}
