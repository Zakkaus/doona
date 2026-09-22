import {
  useCapabilities,
  useConnectionClose,
  useConnections,
  useDnsFlush,
  useGeodata,
  useProviderRefresh,
  useProviders,
  useRuntime,
  useRuntimeOperations
} from '../../store';
import {lifecycleActions, operationLabels} from '../overview/view';
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
  // Only the close-all action needs the live count, so the poll runs only where that action exists.
  const connections = useConnections(undefined, resources?.connections.available === true && resources.connections.can_close === true);
  const closing = useConnectionClose(connections.refetch);
  const flushing = useDnsFlush();
  const operations = useRuntimeOperations(runtime.data, capabilities.data, runtime.refetch);
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
  const providersReady = !!providers.data && !providers.error && !providers.loading;
  const connectionsReady = !!connections.data && !connections.error && !connections.loading;
  // Totals, not the returned page: the list is capped at 1,000 entries.
  const liveCount = connectionsReady ? connections.data!.total_tcp + connections.data!.total_udp : null;
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
  const runOperation = (kind: keyof typeof operationLabels) =>
    void operations.run(kind).then(
      result => {
        if (result) toast('positive', t('ov.operationResult', {action: t(operationLabels[kind]), status: t('ov.succeeded'), id: result.operation_id}));
      },
      error => toast('negative', t('ov.operationError', {error: errorText(error)}))
    );
  const closeAll = () =>
    void closing.closeAll({ids: [], query: {all: true}}).then(tally => {
      if (tally) toast(tally.closed ? 'positive' : 'negative', t('conn.closedAll', {closed: tally.closed, skipped: tally.skipped}));
    }, fail);
  return {
    runtimeError: runtime.error,
    lifecycle: lifecycleActions(operations.canRun, operations.busy, runOperation, t),
    flush: {
      confirmationText: t('dns.flushConfirmAll'),
      busy: flushing.busy,
      onFlush: () =>
        void flushing.flush().then(result => {
          if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
        }, fail)
    },
    closeAll: {
      confirmationText: liveCount === null ? '' : t('settings.closeAllHelp', {n: liveCount}),
      disabled: !connectionsReady || !liveCount || !!closing.busy,
      pending: closing.busy === 'all',
      run: closeAll
    },
    geodataBusy: geodata.busy,
    geodataBlocked: geodata.busy || !geodata.data,
    geodataLoading: geodata.loading && !geodata.data,
    geodataError: geodata.error,
    providersError: providers.error,
    providersLoading: providers.loading && !providers.data,
    retryProviders: providers.refetch,
    connectionsError: connections.error,
    connectionsLoading: connections.loading && !connections.data,
    retryConnections: connections.refetch,
    liveCount,
    note: t(offered ? 'settings.actionsNote' : 'settings.actionsNone'),
    refreshingAll,
    refreshAll,
    refreshDisabled: !providersReady || !!refresh.busy || !subscriptions.length,
    refreshLabel: t('settings.refreshAll', {n: providersReady ? formatNumber(subscriptions.length, locale) : '—'}),
    canFlush: !!(resources?.dns_cache.available && resources.dns_cache.flush),
    canRefresh: !!resources?.providers.can_refresh,
    canClose: !!resources?.connections.can_close,
    canUpdate: !!resources?.geodata.can_update,
    hasGeodata: !!resources?.geodata.available,
    rows: geodataRows(geodata.data?.assets ?? [], locale),
    update: () =>
      void geodata.update().then(result => {
        if (result) toast('positive', t('settings.geodataUpdated'));
      }, fail)
  };
}
