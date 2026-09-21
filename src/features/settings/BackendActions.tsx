import {useT} from '../../i18n';
import {Button, DataTable, ErrorMessage, TextTooltip} from '../../ui/ui';
import {LifecycleActions} from '../overview/Lifecycle';
import {CloseAllButton} from '../connections/CloseAll';
import {FlushCacheButton} from '../dns/FlushCache';
import {useBackendActions} from './useBackendActions';
export function BackendActionsCard() {
  const t = useT();
  const {
    runtimeError,
    lifecycle,
    flush,
    closeAll,
    geodataBusy,
    geodataBlocked,
    geodataLoading,
    geodataError,
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
    update
  } = useBackendActions();
  return (
    <section className="rp-card" aria-labelledby="settings-actions">
      <h2 className="rp-h3" id="settings-actions">
        {t('settings.actions')}
      </h2>
      <span className="rp-label">{note}</span>
      <ErrorMessage error={runtimeError} />
      <div className="rp-ops">
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
              <FlushCacheButton {...flush} />
            </div>
          </div>
        )}
        {canRefresh && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.nodes')}</span>
            <div className="rp-cluster">
              <Button isPending={refreshingAll} isDisabled={refreshingAll || refreshDisabled} onPress={() => void refreshAll()}>
                {refreshLabel}
              </Button>
            </div>
          </div>
        )}
        {canClose && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.connections')}</span>
            <div className="rp-cluster">
              <CloseAllButton {...closeAll} />
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
          <ErrorMessage error={geodataError} />
          <DataTable
            label={t('settings.geodata')}
            loading={geodataLoading}
            rows={rows}
            height={160}
            cols={[
              {id: 'kind', label: t('settings.geodataAsset'), minWidth: 100, grow: 0, isRowHeader: true, render: asset => asset.kind},
              {id: 'size', label: t('settings.geodataSize'), minWidth: 100, grow: 0, align: 'end', render: asset => asset.size},
              {
                id: 'modified',
                label: t('nodes.updated'),
                minWidth: 140,
                grow: 0,
                render: asset => <TextTooltip text={asset.modifiedTitle}>{asset.modified}</TextTooltip>
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
                minWidth: 240,
                grow: 2,
                drop: 1,
                render: asset => (
                  <TextTooltip text={asset.source}>
                    <span className="rp-code">{asset.source}</span>
                  </TextTooltip>
                )
              }
            ]}
          />
        </div>
      )}
    </section>
  );
}
