import {useT} from '../../i18n';
import {ActionHelp, Button, Card, DataTable, ErrorMessage, Link, Loading, TextTooltip, TimeCell} from '../../ui/ui';
import {useBackendActions} from './useBackendActions';
import {href} from '../../shell/route';
import {settingsCard} from './nav';

const card = settingsCard('actions');
export function BackendActionsCard() {
  const t = useT();
  const {
    visible,
    lifecycle,
    geodataBusy,
    geodataBlocked,
    geodataReason,
    geodataLoading,
    geodataError,
    retryGeodata,
    note,
    canFlush,
    canRefresh,
    canClose,
    canUpdate,
    hasGeodata,
    fromConfig,
    rows,
    update,
    waiting
  } = useBackendActions();
  if (!waiting && !visible) return null;
  return (
    <Card level={2} title={t(card.titleKey)} titleId={card.headingId}>
      <span className="rp-label">{waiting ? '\u00a0' : note}</span>
      <div className="rp-ops">
        {waiting && (
          <div className="rp-chart-wait ops">
            <Loading />
          </div>
        )}
        {lifecycle && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.groupLifecycle')}</span>
            <div className="rp-cluster">
              <Link appearance="button" href={href('overview', {card: 'status'})}>
                {t('nav.overview')}
              </Link>
            </div>
          </div>
        )}
        {canFlush && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.dns')}</span>
            <div className="rp-cluster">
              <Link appearance="button" href={href('dns', {tab: 'cache'})}>
                {t('settings.openDnsCache')}
              </Link>
            </div>
          </div>
        )}
        {canRefresh && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.nodes')}</span>
            <div className="rp-cluster">
              <Link appearance="button" href={href('nodes', {tab: 'list'})}>
                {t('settings.openSubscriptions')}
              </Link>
            </div>
          </div>
        )}
        {canClose && (
          <div className="rp-ops-group">
            <span className="rp-label">{t('nav.connections')}</span>
            <div className="rp-cluster">
              <Link appearance="button" href={href('connections', {tab: 'list', network: 'all', out: 'all', rule: 'all', src: '', q: '', scope: 'all'})}>
                {t('settings.openConnections')}
              </Link>
            </div>
          </div>
        )}
      </div>
      {hasGeodata && (
        <div className="rp-geodata">
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.geodata')}</span>
            <ActionHelp reason={canUpdate ? geodataReason : null}>
              <div className="rp-cluster">
                {canUpdate && (
                  <Button isPending={geodataBusy} isDisabled={geodataBlocked} onPress={update}>
                    {t('settings.geodataUpdate')}
                  </Button>
                )}
              </div>
            </ActionHelp>
          </div>
          <span className="rp-label">{t('settings.geodataNote')}</span>
          {fromConfig && (
            <span className="rp-label rp-geodata-from-config">
              {fromConfig.text}{' '}
              <Link appearance="link" external href={fromConfig.docs.href}>
                {fromConfig.docs.text}
                <span aria-hidden="true">↗</span>
              </Link>
              {fromConfig.config && (
                <>
                  {' '}
                  <Link appearance="link" href={fromConfig.config.href}>
                    {fromConfig.config.text}
                  </Link>
                </>
              )}
            </span>
          )}
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
    </Card>
  );
}
