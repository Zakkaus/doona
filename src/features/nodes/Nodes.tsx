import {lazy, Suspense, type FormEvent} from 'react';
import {useT} from '../../i18n';
import {
  Button,
  PrimaryActions,
  HelpRow,
  ConfirmDialog,
  Empty,
  ErrorMessage,
  Form,
  Link,
  ProblemAlert,
  ModalDialog,
  StaticField,
  Switch,
  Tabs,
  TextField,
  TextTooltip
} from '../../ui/ui';
import {TextArea} from '../../ui/TextArea';
import {DataTable} from '../../ui/Table';
import {NodeLatency} from './Latency';
import type {PageProps} from '../../shell/routes';
import {ProviderCards} from './ProviderCards';
import {NodeTable} from './NodeTable';
import {useNodesPage} from './useNodesPage';
// Dialog-only fields load when their editor opens, not with the node list.
const XhttpOptions = lazy(() => import('./XhttpOptions').then(module => ({default: module.XhttpOptions})));
const SubscriptionFields = lazy(() => import('./SubscriptionFields').then(module => ({default: module.SubscriptionFields})));
const dialogForm = 'nodes-dialog-form';
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
    batch,
    batchErrors,
    setForm,
    removeNodes,
    setNodeLink,
    xhttp,
    headerDuplicates,
    setXhttp,
    removing,
    dialogTitle,
    formValid,
    formReason,
    nodeNameError,
    nodeLinkError,
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
  const intro = (
    <HelpRow help={{title: t('nav.nodes'), text: t('nodes.sourceHelp')}}>
      <span className="rp-note">{t('nodes.note')}</span>
    </HelpRow>
  );
  const list = (
    <>
      {noSources && intro}
      <ErrorMessage error={error} onRetry={reload} />
      {noSources ? (
        <Empty>
          {t('nodes.noSources')}
          {(addProvider || addNode) && (
            <span className="rp-cluster">
              <PrimaryActions>
                {addProvider && (
                  <Button accent onPress={addProvider}>
                    {t('nodes.addProvider')}
                  </Button>
                )}
                {addNode && <Button onPress={addNode}>{t('nodes.addNode')}</Button>}
              </PrimaryActions>
            </span>
          )}
        </Empty>
      ) : (
        <>
          <ProviderCards model={providerTable} intro={intro} />
          <NodeTable model={nodeTable} />
        </>
      )}
    </>
  );
  const content = {list, latency: <NodeLatency />};
  // Enter in a field submits as the footer's button does; closing the dialog clears it, as Cancel does.
  const NodeLinkField = dialog?.kind === 'node' ? TextArea : TextField;
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (formValid && !submitting) void submit(() => setDialog(null));
  };
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
        <Tabs page keepMounted label={t('nav.nodes')} value={tab} onChange={setTab} items={tabs.map(item => ({...item, content: content[item.id]}))} />
      ) : (
        list
      )}
      {/* Cancel stays live while the write is pending; a result that lands afterwards arrives as a toast. */}
      <ModalDialog
        title={dialogTitle}
        narrow
        scrollBody={dialog?.kind === 'node'}
        isOpen={dialog !== null && !removing}
        reason={pending ? null : formReason}
        onOpenChange={isOpen => {
          if (!isOpen) setDialog(null);
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button accent type="submit" form={dialogForm} isDisabled={!formValid || submitting} isPending={pending}>
              <span aria-live="polite">{submitLabel}</span>
            </Button>
          </>
        )}
      >
        {problem && <ProblemAlert key={problem.id} problem={problem} />}
        {(dialog?.kind === 'provider' || dialog?.kind === 'editProvider') && (
          <Form id={dialogForm} className="rp-list" onSubmit={send}>
            <span className="rp-label">{t(dialog.kind === 'provider' ? 'nodes.addProviderHelp' : 'nodes.editProviderHelp')}</span>
            <Suspense fallback={null}>
              <SubscriptionFields
                focusInterval={dialog.kind === 'editProvider' && dialog.focus === 'interval'}
                value={subscription}
                onChange={setSubscription}
                fields={subscriptionFields}
                isDisabled={pending}
                nameError={subscriptionErrors.name}
                agentError={subscriptionErrors.agent}
                intervalError={subscriptionErrors.interval}
                urlError={subscriptionErrors.url}
              />
            </Suspense>
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
          </Form>
        )}
        {(dialog?.kind === 'node' || dialog?.kind === 'editNode') && (
          <Form id={dialogForm} className="rp-list" onSubmit={send}>
            <span className="rp-label">{t(dialog.kind === 'editNode' ? 'nodes.editNodeHelp' : 'nodes.addNodeHelp')}</span>
            {!batch && (
              <TextField
                error={nodeNameError ?? undefined}
                isDisabled={pending}
                label={t('ui.name')}
                value={form.name}
                placeholder="hk-03"
                onChange={name => setForm({...form, name})}
              />
            )}
            <NodeLinkField
              error={nodeLinkError ?? undefined}
              isDisabled={pending}
              label={t('nodes.link')}
              value={form.value}
              placeholder="vless://…"
              onChange={setNodeLink}
            />
            {batch && (
              <>
                <span className="rp-label">{t('nodes.batchExcluded', {n: batch.rows.filter(row => row.error).length})}</span>
                <DataTable
                  label={t('nodes.batchPreview')}
                  rows={batch.rows}
                  cols={[
                    {id: 'name', label: t('ui.name'), minWidth: 120, isRowHeader: true, text: 'wrap', render: row => row.name},
                    {id: 'scheme', label: t('ui.protocol'), minWidth: 80, render: row => row.scheme},
                    {
                      id: 'error',
                      label: t('ui.error'),
                      minWidth: 120,
                      render: row => row.error && <TextTooltip text={row.error}>{row.errorSummary}</TextTooltip>
                    }
                  ]}
                />
              </>
            )}
            {batchErrors.map((error, index) => (
              <p key={index} className="rp-field-error">
                {error}
              </p>
            ))}
            {xhttp && (
              <Suspense fallback={null}>
                <XhttpOptions fields={xhttp} duplicates={headerDuplicates} isDisabled={pending} onChange={setXhttp} />
              </Suspense>
            )}
          </Form>
        )}
      </ModalDialog>
      <ConfirmDialog
        title={dialogTitle}
        isOpen={removing}
        onCancel={() => setDialog(null)}
        confirmLabel={submitLabel}
        isPending={pending}
        isDisabled={submitting || checkingRemoval || !formValid}
        dismissOnly={!!referenced}
        error={problem}
        scrollBody={dialog?.kind === 'removeNodes'}
        onConfirm={() => void submit(() => setDialog(null))}
      >
        {blocked ?? <p className="rp-label">{t(dialog?.kind === 'removeProvider' ? 'nodes.removeProviderHelp' : 'nodes.removeNodeHelp')}</p>}
        {dialog?.kind === 'removeNodes' && (
          <>
            <ul>
              {removeNodes.map(node => (
                <li key={node.id}>{node.name}</li>
              ))}
            </ul>
            {pending && <p role="status">{submitLabel}</p>}
            {batchErrors.map((error, index) => (
              <p key={index} className="rp-field-error">
                {error}
              </p>
            ))}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
