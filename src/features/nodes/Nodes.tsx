import {useT} from '../../i18n';
import {Button, ConfirmDialog, ErrorMessage, InlineAlert, LabeledSelect, ModalDialog, StaticField, Switch, Tabs, TextField} from '../../ui/ui';
import {NodeLatency} from './Latency';
import type {PageProps} from '../../shell/routes';
import {ProviderTable} from './ProviderTable';
import {NodeTable} from './NodeTable';
import {useNodesPage} from './useNodesPage';
import {PolicyPicker} from '../shared/PolicyPicker';
export function Nodes(props: PageProps) {
  const t = useT();
  const {
    tabs,
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
    formReason,
    submit,
    pending,
    submitting,
    submitLabel,
    groupHelp,
    groupNameError,
    agentError,
    options,
    policy,
    setPolicy,
    editNameError,
    editOptions,
    editAgentError,
    editAgentDefault,
    editCache,
    renameGroups,
    renameFrom,
    renameBlocked,
    updateGroups,
    setUpdateGroups
  } = useNodesPage(props);
  const list = (
    <>
      <p className="rp-note">{t('nodes.note')}</p>
      <ErrorMessage error={error} onRetry={reload} />
      <ProviderTable model={providerTable} />
      <NodeTable model={nodeTable} />
    </>
  );
  const content = {list, latency: <NodeLatency />};
  return (
    <div className="rp-page">
      {tabs.length > 0 ? (
        <Tabs keepMounted label={t('nav.nodes')} value={tab} onChange={setTab} items={tabs.map(item => ({...item, content: content[item.id]}))} />
      ) : (
        list
      )}
      {/* Cancel stays live while the write is pending; a result that lands afterwards arrives as a toast. */}
      <ModalDialog
        title={dialogTitle}
        narrow
        isOpen={dialog !== null && !removing}
        reason={pending ? null : formReason}
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
            {options?.intervals && (
              <LabeledSelect
                label={t('nodes.interval')}
                items={options.intervals}
                value={options.interval}
                isDisabled={pending}
                onChange={interval => setForm({...form, interval})}
              />
            )}
            {options?.agent !== undefined && (
              <TextField
                isDisabled={pending}
                label={t('nodes.agent')}
                value={form.agent}
                placeholder={options.agent}
                error={agentError ?? undefined}
                spellCheck={false}
                onChange={agent => setForm({...form, agent})}
              />
            )}
            {options?.cache != null && (
              <>
                <Switch isSelected={options.cache} isDisabled={pending} onChange={cache => setForm({...form, cache})}>
                  {t('nodes.cache')}
                </Switch>
                <span className="rp-label">{t('nodes.cacheHelp')}</span>
              </>
            )}
          </div>
        )}
        {dialog?.kind === 'editProvider' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.editProviderHelp')}</span>
            <TextField
              isDisabled={pending}
              label={t('nodes.name')}
              value={form.name}
              spellCheck={false}
              error={editNameError ?? undefined}
              onChange={name => setForm({...form, name})}
            />
            <TextField isDisabled={pending} label={t('nodes.url')} value={form.value} spellCheck={false} onChange={value => setForm({...form, value})} />
            <TextField
              isDisabled={pending}
              label={t('nodes.agent')}
              value={form.agent}
              placeholder={editAgentDefault}
              description={t('nodes.agentDefault')}
              error={editAgentError ?? undefined}
              spellCheck={false}
              onChange={agent => setForm({...form, agent})}
            />
            {editCache !== null && (
              <>
                <Switch isSelected={editCache} isDisabled={pending} onChange={cache => setForm({...form, cache})}>
                  {t('nodes.cache')}
                </Switch>
                <span className="rp-label">{t('nodes.cacheHelp')}</span>
              </>
            )}
            {renameGroups && (
              <>
                <Switch isSelected={updateGroups} isDisabled={pending} onChange={setUpdateGroups}>
                  {t('nodes.renameGroups', {groups: renameGroups})}
                </Switch>
                {!updateGroups && <span className="rp-label">{t('nodes.renameGroupsHelp', {name: renameFrom})}</span>}
              </>
            )}
            {renameBlocked && <span className="rp-label">{t('nodes.renameBlocked', {files: renameBlocked, name: renameFrom})}</span>}
            {editOptions.length > 0 && (
              <>
                <span className="rp-label">{t('nodes.editOptions')}</span>
                {editOptions.map(option => (
                  <StaticField key={option.name} label={option.name} value={option.value} />
                ))}
              </>
            )}
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
