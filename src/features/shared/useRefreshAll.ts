import type {useProviderRefresh, useProviders} from '../../store';
import {useT} from '../../i18n';
import {toast, toastErrorDetail} from '../../ui/ui';
import {refreshAllReason} from './refreshAll';

// Refreshing every subscription in one batch, which Settings' backend actions and the Nodes subscription list both
// offer. `refresh` is the page's own, so a single refresh and the batch share one busy state.
export function useRefreshAll(providers: Pick<ReturnType<typeof useProviders>, 'data' | 'error' | 'loading'>, refresh: ReturnType<typeof useProviderRefresh>) {
  const t = useT();
  const subscriptions = (providers.data?.providers ?? []).filter(item => item.kind === 'subscription');
  const ready = !!providers.data && !providers.error && !providers.loading;
  // Failures fold into the one summary toast, which names the first error: a toast per subscription would bury it.
  const run = () => {
    const failures: unknown[] = [];
    let degraded = false;
    return refresh
      .refreshMany(
        subscriptions.map(item => item.id),
        (_id, error) => failures.push(error),
        () => (degraded = true)
      )
      .then(
        done => {
          // Undefined: the batch was cancelled (the page was left), so there is nothing to report.
          if (done === undefined) return;
          const counts = {n: done, total: subscriptions.length};
          const kind = done === subscriptions.length ? 'positive' : done ? 'info' : 'negative';
          if (failures.length) toast(kind, t('settings.refreshedAllFailed', {...counts, failed: failures.length}), toastErrorDetail(failures[0], t));
          else toast(kind, t('settings.refreshedAll', counts));
          if (degraded) toast('info', t('settings.refreshedDegraded'));
        },
        error => toast('negative', t('settings.refreshAllFailed'), toastErrorDetail(error, t))
      );
  };
  return {
    refreshing: refresh.busy === '*',
    run,
    disabled: !ready || !!refresh.busy || !subscriptions.length,
    reason: refreshAllReason({ready, busy: !!refresh.busy, count: subscriptions.length}, t),
    label: t('settings.refreshAll', {n: ready ? subscriptions.length : '—'})
  };
}
