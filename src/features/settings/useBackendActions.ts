import {useCapabilities, useConnectionClose, useConnections, useDnsFlush, useGeodata, useProviderRefresh, useProviders, useRuntime} from '../../api/store';
import {LOCALE, formatNumber, useLang, useT} from '../../i18n';
import {errorText, toast} from '../../ui/ui';
import {geodataRows} from './view';
export function useBackendActions() {
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
  const fail = (error: unknown) => toast('negative', errorText(error));
  const lifecycle = !!resources?.operations.available && (['reload', 'suspend', 'resume'] as const).some(kind => resources[kind].available);
  const offered =
    lifecycle ||
    !!(resources?.dns_cache.available && resources.dns_cache.flush) ||
    !!resources?.providers.can_refresh ||
    !!resources?.connections.can_close ||
    !!resources?.geodata.can_update;
  const subscriptions = (providers.data?.providers ?? []).filter(item => item.kind === 'subscription');
  const liveCount = (connections.data?.tcp.length ?? 0) + (connections.data?.udp.length ?? 0);
  const refreshingAll = refresh.busy === '*';
  const refreshAll = () =>
    refresh
      .refreshMany(
        subscriptions.map(item => item.id),
        (_id, error) => fail(error)
      )
      .then(done => {
        // Undefined: the batch was cancelled (the page was left), so there is nothing to report.
        if (done !== undefined)
          toast(done ? 'positive' : 'negative', t('settings.refreshedAll', {n: formatNumber(done, locale), total: formatNumber(subscriptions.length, locale)}));
      }, fail);
  return {
    capabilities,
    runtime,
    closing,
    flushing: flushing.busy,
    geodataBusy: geodata.busy,
    geodataBlocked: geodata.busy || !geodata.data,
    geodataLoading: geodata.loading && !geodata.data,
    geodataError: geodata.error,
    liveCount,
    note: t(offered ? 'settings.actionsNote' : 'settings.actionsNone'),
    refreshingAll,
    refreshAll,
    refreshDisabled: !!refresh.busy || !subscriptions.length,
    refreshLabel: t('settings.refreshAll', {n: formatNumber(subscriptions.length, locale)}),
    canFlush: !!(resources?.dns_cache.available && resources.dns_cache.flush),
    canRefresh: !!resources?.providers.can_refresh,
    canClose: !!resources?.connections.can_close,
    canUpdate: !!resources?.geodata.can_update,
    hasGeodata: !!resources?.geodata.available,
    rows: geodataRows(geodata.data?.assets ?? [], locale),
    flush: () =>
      void flushing.flush().then(result => {
        if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
      }, fail),
    update: () =>
      void geodata.update().then(result => {
        if (result) toast('positive', t('settings.geodataUpdated'));
      }, fail)
  };
}
