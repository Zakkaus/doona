import {useT} from '../../i18n';
import {Button, HelpRow, ConfirmDialog, Empty, ErrorMessage, Link, ProblemAlert, ModalDialog, StaticField, Switch, Tabs, TextField} from '../../ui/ui';
import {NodeLatency} from './Latency';
import type {PageProps} from '../../shell/routes';
import {ProviderTable} from './ProviderTable';
import {NodeTable} from './NodeTable';
import {useNodesPage} from './useNodesPage';
import {SubscriptionFields} from '../shared/SubscriptionFields';
export function Nodes(props: PageProps) {
  const t = useT();
  const {
    tabs,
    tab,
    setTab,
    providerTable,
    nodeTable,
    noSources,
    addProvider,
    addNode,
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
    nodeNameError,
    submit,
    pending,
    submitting,
    submitLabel,
    subscription,
    setSubscription,
    subscriptionFields,
    subscriptionErrors,
    editOptions,
    renameGroups,
    renameFrom,
    referenced,
    checkingRemoval,
    updateGroups,
    setUpdateGroups
  } = useNodesPage(props);
  const list = (
    <>
      <HelpRow help={{title: t('nav.nodes'), text: t('nodes.sourceHelp')}}>
        <span className="rp-note">{t('nodes.note')}</span>
      </HelpRow>
      <ErrorMessage error={error} onRetry={reload} />
      {noSources ? (
        <Empty>
          {t('nodes.noSources')}
          {(addProvider || addNode) && (
            <span className="rp-cluster">
              {addProvider && (
                <Button accent onPress={addProvider}>
                  {t('nodes.addProvider')}
                </Button>
              )}
              {addNode && <Button onPress={addNode}>{t('nodes.addNode')}</Button>}
            </span>
          )}
        </Empty>
      ) : (
        <>
          <ProviderTable model={providerTable} />
          <NodeTable model={nodeTable} />
        </>
      )}
    </>
  );
  const content = {list, latency: <NodeLatency />};
  const blocked = referenced && (
    <span className="rp-label">
      {t('nodes.referenced', {groups: referenced.groups, name: referenced.name})}{' '}
      <Link appearance="link" href={referenced.href}>
        {t('nodes.openPolicies')}
      </Link>
    </span>
  );
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
        {problem && <ProblemAlert key={problem.id} problem={problem} />}
        {(dialog?.kind === 'provider' || dialog?.kind === 'editProvider') && (
          <div className="rp-list">
            <span className="rp-label">{t(dialog.kind === 'provider' ? 'nodes.addProviderHelp' : 'nodes.editProviderHelp')}</span>
            <SubscriptionFields
              focusInterval={dialog.kind === 'editProvider' && dialog.focus === 'interval'}
              value={subscription}
              onChange={setSubscription}
              fields={subscriptionFields}
              isDisabled={pending}
              nameError={subscriptionErrors.name}
              agentError={subscriptionErrors.agent}
              intervalError={subscriptionErrors.interval}
            />
            {renameGroups && (
              <>
                <Switch isSelected={updateGroups} isDisabled={pending} onChange={setUpdateGroups}>
                  {t('nodes.renameGroups', {groups: renameGroups})}
                </Switch>
                {!updateGroups && <span className="rp-label">{t('nodes.renameGroupsHelp', {name: renameFrom})}</span>}
              </>
            )}
            {blocked}
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
        {(dialog?.kind === 'node' || dialog?.kind === 'editNode') && (
          <div className="rp-list">
            <span className="rp-label">{t(dialog.kind === 'editNode' ? 'nodes.editNodeHelp' : 'nodes.addNodeHelp')}</span>
            <TextField
              error={nodeNameError ?? undefined}
              isDisabled={pending}
              label={t('nodes.name')}
              value={form.name}
              placeholder="hk-03"
              onChange={name => setForm({...form, name})}
            />
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
        isDisabled={submitting || checkingRemoval}
        dismissOnly={!!referenced}
        error={problem}
        onConfirm={() => void submit(() => setDialog(null))}
      >
        {blocked ?? <p className="rp-label">{t(dialog?.kind === 'removeProvider' ? 'nodes.removeProviderHelp' : 'nodes.removeNodeHelp')}</p>}
      </ConfirmDialog>
    </div>
  );
}
