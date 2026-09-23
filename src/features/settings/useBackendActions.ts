import {
  useCapabilities,
  useConnectionClose,
  useConnectionTotals,
  useDnsFlush,
  useGeodata,
  useProviderRefresh,
  useProviders,
  useRuntime,
  useRuntimeOperations
} from '../../store';
import {lifecycleActions} from '../overview/view';
import {closedAllTone, operationLabels} from '../../api/selectors';
import {LOCALE, formatNumber, useLang, useT} from '../../i18n';
import {toast} from '../../ui/ui';
import {geodataRows} from './view';
import {errorText} from '../../api/error';
import {offered} from '../../api/capabilities';
export function useBackendActions() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(offered(resources, 'runtime', {whileLoading: false}));
  const providers = useProviders(offered(resources, 'providers', {whileLoading: false}));
  const refresh = useProviderRefresh(providers.refetch);
  // Only the close-all action needs the live count, so the poll runs only where that action exists.
  const connections = useConnectionTotals(offered(resources, 'connections', {whileLoading: false}) && resources?.connections.can_close === true);
  const closing = useConnectionClose(connections.refetch);
  const flushing = useDnsFlush();
  const operations = useRuntimeOperations(runtime.data, capabilities.data, runtime.refetch);
  const geodata = useGeodata(offered(resources, 'geodata', {whileLoading: false}));
  const fail = (error: unknown) => toast('negative', errorText(error, t));
  const lifecycle = !!resources?.operations.available && (['reload', 'suspend', 'resume'] as const).some(kind => resources[kind].available);
  const anyAction =
    lifecycle ||
    !!(resources?.dns_cache.available && resources.dns_cache.flush) ||
    !!resources?.providers.can_refresh ||
    !!resources?.connections.can_close ||
    !!resources?.geodata.can_update;
  const subscriptions = (providers.data?.providers ?? []).filter(item => item.kind === 'subscription');
  const providersReady = !!providers.data && !providers.error && !providers.loading;
  const connectionsReady = !!connections.data && !connections.error && !connections.loading;
  const liveCount = connectionsReady ? connections.data!.total_tcp + connections.data!.total_udp : null;
  const refreshingAll = refresh.busy === '*';
  // Failures fold into the one summary toast, which names the first error: a toast per subscription would bury it.
  const refreshAll = () => {
    const failures: unknown[] = [];
    return refresh
      .refreshMany(
        subscriptions.map(item => item.id),
        (_id, error) => failures.push(error)
      )
      .then(done => {
        // Undefined: the batch was cancelled (the page was left), so there is nothing to report.
        if (done === undefined) return;
        const counts = {n: formatNumber(done, locale), total: formatNumber(subscriptions.length, locale)};
        toast(
          done === subscriptions.length ? 'positive' : done ? 'info' : 'negative',
          failures.length
            ? t('settings.refreshedAllFailed', {...counts, failed: formatNumber(failures.length, locale), error: errorText(failures[0], t)})
            : t('settings.refreshedAll', counts)
        );
      }, fail);
  };
  const runOperation = (kind: keyof typeof operationLabels) =>
    void operations.run(kind).then(
      result => {
        if (result) toast('positive', t('ov.operationResult', {action: t(operationLabels[kind]), status: t('ov.succeeded'), id: result.operation_id}));
      },
      error => toast('negative', t('ov.operationError', {error: errorText(error, t)}))
    );
  const closeAll = () =>
    closing.closeAll({ids: [], query: {all: true}}).then(
      tally => {
        if (tally) toast(closedAllTone(tally), t('conn.closedAll', {closed: tally.closed, skipped: tally.skipped}));
      },
      error => t('conn.closeFailed', {error: errorText(error, t)})
    );
  return {
    runtimeError: runtime.error,
    retryRuntime: runtime.refetch,
    lifecycle: lifecycleActions(operations.canRun, operations.busy, runOperation, t),
    flush: {
      confirmationText: t('dns.flushConfirmAll'),
      isPending: flushing.busy,
      isDisabled: flushing.busy,
      onConfirm: () =>
        flushing.flush().then(
          result => {
            if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
          },
          error => t('dns.flushFailed', {error: errorText(error, t)})
        )
    },
    closeAll: {
      confirmationText: liveCount === null ? '' : t('settings.closeAllHelp', {n: liveCount}),
      isDisabled: !connectionsReady || !liveCount || !!closing.busy,
      isPending: closing.busy === 'all' || (connections.loading && !connections.data),
      onConfirm: closeAll
    },
    geodataBusy: geodata.busy,
    geodataBlocked: geodata.busy || !geodata.data,
    geodataLoading: geodata.loading && !geodata.data,
    geodataError: geodata.error,
    retryGeodata: geodata.refetch,
    providersError: providers.error,
    providersLoading: providers.loading && !providers.data,
    retryProviders: providers.refetch,
    connectionsError: connections.error,
    retryConnections: connections.refetch,
    // Only while capabilities are on their way; a failed load is reported by the page banner, not a spinner.
    waiting: !resources && !capabilities.error,
    note: t(anyAction ? 'settings.actionsNote' : 'settings.actionsNone'),
    refreshingAll,
    refreshAll,
    refreshDisabled: !providersReady || !!refresh.busy || !subscriptions.length,
    refreshLabel: t('settings.refreshAll', {n: providersReady ? formatNumber(subscriptions.length, locale) : '—'}),
    canFlush: !!(resources?.dns_cache.available && resources.dns_cache.flush),
    canRefresh: !!resources?.providers.can_refresh,
    canClose: !!resources?.connections.can_close,
    canUpdate: !!resources?.geodata.can_update,
    hasGeodata: !!resources?.geodata.available,
    rows: geodataRows(geodata.data?.assets ?? []),
    update: () =>
      void geodata.update().then(result => {
        if (result) toast('positive', t('settings.geodataUpdated'));
      }, fail)
  };
}
