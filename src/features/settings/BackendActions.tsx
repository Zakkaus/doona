import {useCapabilities, useConnectionClose, useConnections, useDnsFlush, useGeodata, useProviderRefresh, useProviders, useRuntime} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime, relativeStart} from '../../api/selectors';
import {LOCALE, formatNumber, useLang, useT} from '../../i18n';
import {Button, DataTable, ErrorMessage, TextTooltip, errorText, toast} from '../../ui/ui';
import {LifecycleActions} from '../overview/Lifecycle';
import {CloseAllButton} from '../connections/CloseAll';
import {FlushCacheButton} from '../dns/FlushCache';
import {useState} from 'react';

// One place for the one-shot backend actions the contract offers: reload, suspend or resume, the DNS cache, subscriptions, connections and the geodata files. Each control is the same component the
// action's own page uses; every one is gated on the capability that backs it.
export function BackendActionsCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(!!resources?.runtime.available);
  const providers = useProviders(resources?.providers.available === true);
  const refresh = useProviderRefresh(providers.refetch);
  const connections = useConnections(undefined, resources?.connections.available === true);
  const closing = useConnectionClose(connections.refetch);
  const flushing = useDnsFlush();
  const geodata = useGeodata(resources?.geodata.available ?? false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const fail = (error: unknown) => toast('negative', errorText(error));
  const lifecycle = !!resources?.operations.available && (['reload', 'suspend', 'resume'] as const).some(kind => resources[kind].available);
  const offered =
    lifecycle ||
    !!(resources?.dns_cache.available && resources.dns_cache.flush) ||
    !!resources?.providers.can_refresh ||
    !!resources?.connections.can_close ||
    !!resources?.geodata.can_update;
  const subscriptions = (providers.data?.providers ?? []).filter(item => item.kind === 'subscription');
  const live = (connections.data ? [...connections.data.tcp, ...connections.data.udp] : []).map(c => c.id);
  // Subscriptions refresh one after another: the backend keeps one refresh per provider in flight anyway.
  const refreshAll = async () => {
    setRefreshingAll(true);
    let done = 0;
    try {
      for (const item of subscriptions) {
        try {
          if (await refresh.refresh(item.id)) done += 1;
        } catch (error) {
          fail(error);
        }
      }
      toast(done ? 'positive' : 'negative', t('settings.refreshedAll', {n: formatNumber(done, locale), total: formatNumber(subscriptions.length, locale)}));
    } finally {
      setRefreshingAll(false);
    }
  };
  return (
    <section className="rp-card" aria-labelledby="settings-actions">
      <h2 className="rp-h3" id="settings-actions">
        {t('settings.actions')}
      </h2>
      <span className="rp-label">{t(offered ? 'settings.actionsNote' : 'settings.actionsNone')}</span>
      <ErrorMessage error={runtime.error} />
      <div className="rp-toolbar">
        <LifecycleActions runtime={runtime} capabilities={capabilities.data} />
      </div>
      <div className="rp-toolbar">
        {resources?.dns_cache.available && resources.dns_cache.flush && (
          <FlushCacheButton
            count={null}
            busy={flushing.busy}
            onFlush={() => {
              void flushing.flush().then(result => {
                if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
              }, fail);
            }}
          />
        )}
        {resources?.providers.can_refresh && (
          <Button isPending={refreshingAll} isDisabled={refreshingAll || !!refresh.busy || !subscriptions.length} onPress={() => void refreshAll()}>
            {t('settings.refreshAll', {n: formatNumber(subscriptions.length, locale)})}
          </Button>
        )}
        {resources?.connections.can_close && <CloseAllButton count={live.length} selection={{query: {all: true}}} closing={closing} />}
        {resources?.geodata.can_update && (
          <Button
            isPending={geodata.busy}
            isDisabled={geodata.busy || !geodata.data}
            onPress={() => {
              void geodata.update().then(result => {
                if (result) toast('positive', t('settings.geodataUpdated'));
              }, fail);
            }}
          >
            {t('settings.geodataUpdate')}
          </Button>
        )}
      </div>
      {resources?.geodata.available && (
        <>
          <span className="rp-label">{t('settings.geodataNote')}</span>
          <ErrorMessage error={geodata.error} />
          <DataTable
            label={t('settings.geodata')}
            loading={geodata.loading && !geodata.data}
            rows={(geodata.data?.assets ?? []).map(asset => ({...asset, id: asset.kind}))}
            height={160}
            cols={[
              {id: 'kind', label: t('settings.geodataAsset'), minWidth: 100, grow: 0, isRowHeader: true},
              {id: 'size', label: t('settings.geodataSize'), minWidth: 100, grow: 0, align: 'end'},
              {id: 'modified', label: t('nodes.updated'), minWidth: 140, grow: 0},
              {id: 'sha', label: 'SHA-256', minWidth: 160, drop: 2},
              {id: 'source', label: t('settings.geodataSource'), minWidth: 240, grow: 2, drop: 1}
            ]}
            render={asset => [
              asset.kind,
              formatBytes(asset.size_bytes),
              <TextTooltip text={asset.modified_at ? localTime(asset.modified_at, locale) : undefined}>{relativeStart(asset.modified_at, locale)}</TextTooltip>,
              <TextTooltip text={asset.sha256}>
                <span className="rp-code">{asset.sha256.slice(0, 12)}</span>
              </TextTooltip>,
              asset.source_redacted ?? '—'
            ]}
          />
        </>
      )}
    </section>
  );
}
