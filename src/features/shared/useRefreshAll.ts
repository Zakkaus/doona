import type {useProviderRefresh, useProviders} from '../../store';
import {useT} from '../../i18n';
import {failureNotice} from '../../api/error';
import {toast, toastErrorDetail, toastFailure} from '../../ui/ui';
import {refreshAllReason} from './refreshAll';

// A single subscription refresh and the batch share the Nodes page's busy state.
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
          // Nothing refreshed is a failure, unless every refresh only left its outcome unknown.
          const unknown = failures.length > 0 && failures.every(error => failureNotice(error, t, '').kind === 'neutral');
          const kind = done === subscriptions.length ? 'positive' : done ? 'info' : unknown ? 'neutral' : 'negative';
          if (failures.length) toast(kind, t('settings.refreshedAllFailed', {...counts, failed: failures.length}), toastErrorDetail(failures[0], t));
          else toast(kind, t('settings.refreshedAll', counts));
          if (degraded) toast('info', t('settings.refreshedDegraded'));
        },
        error => toastFailure(error, t, t('settings.refreshAllFailed'))
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
