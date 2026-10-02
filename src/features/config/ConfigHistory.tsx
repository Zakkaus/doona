import {useT} from '../../i18n';
import {
  ContextualHelp,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DialogSection,
  Disclosure,
  Empty,
  ErrorMessage,
  InlineAlert,
  Kv,
  Loading,
  ModalDialog,
  TimeCell
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {useConfigHistory} from './useConfigHistory';

export function ConfigHistory() {
  const t = useT();
  const h = useConfigHistory();
  return (
    <>
      <div className="rp-cluster">
        {h.management.export && (
          <Button onPress={() => void h.export()} isPending={h.exporting}>
            <Download />
            {t('config.backup.export')}
          </Button>
        )}
        {h.management.import && <Button onPress={() => h.show(null)}>{t('config.backup.import')}</Button>}
        {(h.management.export || h.list.data) && (
          <ContextualHelp
            title={t('config.tabHistory')}
            size="control"
            text={[
              ...(h.management.export ? [t('config.backup.exportHelp')] : []),
              ...(h.list.data ? [t('config.revisions.retention', {n: h.list.data.max_revisions})] : [])
            ]}
          />
        )}
      </div>
      <ErrorMessage error={h.exportError} message={error => t('config.backup.exportFailed', {error})} />
      {h.view.unrecorded && <InlineAlert tone="informative">{t('config.revisions.unrecorded')}</InlineAlert>}
      {h.management.revisions && (
        <>
          <ErrorMessage error={h.list.error} onRetry={h.list.refetch} />
          {!h.list.data && h.list.loading ? (
            <Loading />
          ) : (
            h.list.data && (
              <>
                {h.view.rows.length ? (
                  <DataTable
                    label={t('config.tabHistory')}
                    rows={h.view.rows}
                    fit
                    loading={h.list.loading}
                    selected={h.selected}
                    onSelect={h.setSelected}
                    rowDetail
                    cols={[
                      {
                        id: 'revision',
                        label: t('config.revisions.revision'),
                        minWidth: 160,
                        isRowHeader: true,
                        render: row => (
                          <span className="rp-cluster">
                            {row.number}
                            {row.head && <Badge>{t('config.revisions.head')}</Badge>}
                          </span>
                        )
                      },
                      {id: 'created', label: t('config.revisions.createdAt'), minWidth: 150, render: row => <TimeCell at={row.created_at} />},
                      {id: 'origin', label: t('config.revisions.origin'), minWidth: 110, render: row => row.originText},
                      {id: 'size', label: t('config.revisions.bytes'), minWidth: 100, render: row => row.size}
                    ]}
                  />
                ) : (
                  <Empty>{t('config.revisions.empty')}</Empty>
                )}
              </>
            )
          )}
        </>
      )}
      <ModalDialog
        title={t('config.revisions.details')}
        isOpen={!!h.detail}
        onOpenChange={open => {
          if (!open) h.setSelected(null);
        }}
        scrollBody
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.close')}</Button>
            {h.management.canActivate && (
              <Button
                isDisabled={!h.detail?.canRestore}
                onPress={() => {
                  h.show(h.detail!.revision);
                  h.setSelected(null);
                }}
              >
                {t('config.revisions.restore')}
              </Button>
            )}
          </>
        )}
      >
        {h.detail && (
          <>
            <Kv items={h.detail.metadata} />
            <DialogSection title={t('config.revisions.sources')}>
              {h.detail.sources.map((source, index) => (
                <Kv
                  key={index}
                  items={[
                    [t('config.source'), source.path],
                    [t('config.revisions.hash'), source.sha256]
                  ]}
                />
              ))}
            </DialogSection>
          </>
        )}
      </ModalDialog>
      <ConfirmDialog
        title={h.confirmation?.revision === null ? t('config.backup.importTitle') : t('config.revisions.restoreTitle', {revision: h.target?.number ?? ''})}
        isOpen={!!h.confirmation}
        onCancel={h.close}
        onConfirm={() => void h.submit()}
        isPending={h.busy}
        isDisabled={h.confirmDisabled}
        confirmLabel={t(h.confirmation?.revision === null ? 'config.backup.import' : 'config.revisions.restore')}
        error={h.problem}
        scrollBody
      >
        <p>{h.confirmation?.revision === null ? t('config.backup.importHelp') : t('config.revisions.restoreHelp')}</p>
        {h.target && <Kv items={h.target.metadata.slice(0, 2)} />}
        {h.view.headNumber !== undefined && <Kv items={[[t('config.revisions.head'), h.view.headNumber]]} />}
        {h.confirmation?.operation && !h.busy && (
          <InlineAlert tone="informative">
            <p>{t('ui.operationUnknown')}</p>
            <Button onPress={() => void h.reread()}>{t('ui.refresh')}</Button>
          </InlineAlert>
        )}
        {h.diagnostics.length > 0 && (
          <DataTable
            label={t('config.diagnostics')}
            rows={h.diagnostics}
            fit
            cols={[
              {
                id: 'message',
                isRowHeader: true,
                label: t('config.diagnostics'),
                minWidth: 220,
                text: 'wrap',
                render: row => (
                  <span>
                    {row.text}
                    {row.backend && row.backend !== row.message && (
                      <Disclosure flush title={t('config.backendText')}>
                        <code>{row.backend}</code>
                      </Disclosure>
                    )}
                  </span>
                )
              }
            ]}
          />
        )}
      </ConfirmDialog>
    </>
  );
}
