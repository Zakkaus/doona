import {useT} from '../../i18n';
import {Button, ConfirmButton, DataTable, ErrorMessage, Loading, TextTooltip, TimeCell} from '../../ui/ui';
import {LifecycleActions} from '../overview/Lifecycle';
import {useBackendActions} from './useBackendActions';
import {settingsCard} from './view';

const card = settingsCard('actions');
export function BackendActionsCard() {
  const t = useT();
  const {
    runtimeError,
    retryRuntime,
    lifecycle,
    flush,
    closeAll,
    geodataBusy,
    geodataBlocked,
    geodataLoading,
    geodataError,
    retryGeodata,
    providersError,
    providersLoading,
    retryProviders,
    connectionsError,
    retryConnections,
    note,
    refreshingAll,
    refreshAll,
    refreshDisabled,
    refreshLabel,
    canFlush,
    canRefresh,
    canClose,
    canUpdate,
    hasGeodata,
    rows,
    update,
    waiting
  } = useBackendActions();
  return (
    <section className="rp-card" aria-labelledby={card.headingId}>
      <h2 className="rp-h3" id={card.headingId}>
        {t(card.titleKey)}
      </h2>
      <span className="rp-label">{waiting ? '\u00a0' : note}</span>
      <ErrorMessage error={runtimeError} onRetry={retryRuntime} />
      <div className="rp-ops">
        {waiting && (
          <div className="rp-chart-wait ops">
            <Loading />
          </div>
        )}
        {lifecycle.length > 0 && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.groupLifecycle')}</span>
            <div className="rp-cluster">
              <LifecycleActions actions={lifecycle} />
            </div>
          </div>
        )}
        {canFlush && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.dns')}</span>
            <div className="rp-cluster">
              <ConfirmButton label={t('dns.flushAll')} {...flush} />
            </div>
          </div>
        )}
        {canRefresh && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.nodes')}</span>
            <ErrorMessage error={providersError} onRetry={retryProviders} />
            {/* Loading shows on the button itself: a spinner row would push the other groups down and back. */}
            <div className="rp-cluster">
              <Button isPending={refreshingAll || providersLoading} isDisabled={refreshingAll || refreshDisabled} onPress={() => void refreshAll()}>
                {refreshLabel}
              </Button>
            </div>
          </div>
        )}
        {canClose && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.connections')}</span>
            <ErrorMessage error={connectionsError} onRetry={retryConnections} />
            <div className="rp-cluster">
              <ConfirmButton label={t('conn.closeAll')} {...closeAll} />
            </div>
          </div>
        )}
      </div>
      {hasGeodata && (
        <div className="rp-geodata">
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.geodata')}</span>
            <div className="rp-cluster">
              {canUpdate && (
                <Button isPending={geodataBusy} isDisabled={geodataBlocked} onPress={update}>
                  {t('settings.geodataUpdate')}
                </Button>
              )}
            </div>
          </div>
          <span className="rp-label">{t('settings.geodataNote')}</span>
          <ErrorMessage error={geodataError} onRetry={retryGeodata} />
          <DataTable
            label={t('settings.geodata')}
            loading={geodataLoading}
            rows={rows}
            height={160}
            fit
            cols={[
              {id: 'kind', label: t('settings.geodataAsset'), minWidth: 100, grow: 0, isRowHeader: true, render: asset => asset.kind},
              {id: 'size', label: t('settings.geodataSize'), minWidth: 100, grow: 0, align: 'end', render: asset => asset.size},
              {
                id: 'modified',
                label: t('nodes.updated'),
                minWidth: 140,
                grow: 0,
                render: asset => <TimeCell at={asset.modifiedAt} />
              },
              {
                id: 'sha',
                label: 'SHA-256',
                minWidth: 160,
                drop: 2,
                render: asset => (
                  <TextTooltip text={asset.shaTitle}>
                    <span className="rp-code">{asset.sha}</span>
                  </TextTooltip>
                )
              },
              {
                id: 'source',
                label: t('settings.geodataSource'),
                // A release URL is cut at the column's end; the tooltip gives it whole.
                minWidth: 240,
                grow: 2,
                render: asset => <TextTooltip className="rp-code">{asset.source}</TextTooltip>
              }
            ]}
          />
        </div>
      )}
    </section>
  );
}
