import {useCallback, useMemo, useState} from 'react';
import {useCapabilities, useRuntime, useRuntimeMemory, useTrafficHistory} from '../../store';
import {formatBytes} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {fmtRate} from '../../i18n/format';
import {usePalette} from '../../ui/charts';
import {useMemorySeries} from './useMemorySeries';
import {historyTrafficSamples, trafficWindow, trafficWindows, useTrafficSamples} from './traffic';
import {useNotices} from './useNotices';
import {useMode} from './useMode';
import {activityView, trafficState} from './view';
import {offered} from '../../api/capabilities';

export function useActivity() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(offered(resources, 'runtime', {whileLoading: false}));
  const memory = useRuntimeMemory(offered(resources, 'runtime_memory', {whileLoading: false}));
  const [range, setRange] = useState('live');
  const windowSeconds = trafficWindows[range] ?? 120;
  const memoryHistory = useMemorySeries(capabilities.data, memory.data);
  const history = useTrafficHistory(windowSeconds, capabilities.data);
  const polledTraffic = useTrafficSamples(runtime.data);
  const historySamples = useMemo(() => (history.data ? historyTrafficSamples(history.data) : []), [history.data]);
  const series = useMemo(() => trafficWindow(polledTraffic, historySamples, windowSeconds), [polledTraffic, historySamples, windowSeconds]);
  const spark = useMemo(() => trafficWindow(polledTraffic, historySamples, trafficWindows.live, undefined, 24), [polledTraffic, historySamples]);
  const traffic = useMemo(
    () => [
      {label: t('act.download'), color: p.cat[0], values: series.down},
      {label: t('act.upload'), color: p.cat[3], values: series.up}
    ],
    [t, p, series]
  );
  const memorySeries = useMemo(
    () => [
      {label: t('act.rss'), color: p.cat[0], values: memoryHistory.rss},
      {label: t('act.cgroup'), color: p.cat[3], values: memoryHistory.cgroup}
    ],
    [t, p, memoryHistory.rss, memoryHistory.cgroup]
  );
  const trafficBounds = useMemo(() => ({since: series.since, until: series.until}), [series.since, series.until]);
  const memoryBounds = useMemo(() => ({since: memoryHistory.since, until: memoryHistory.until}), [memoryHistory.since, memoryHistory.until]);
  const chartRate = useCallback((value: number | null | undefined) => fmtRate(value, locale, t), [locale, t]);
  const memoryBytes = useCallback((value: number | null | undefined) => formatBytes(value == null ? null : BigInt(Math.round(value))), []);
  const view = useMemo(
    () => activityView(runtime.data, memory.data, t, resources?.runtime.available, locale),
    [runtime.data, memory.data, t, resources?.runtime.available, locale]
  );
  const notices = useNotices();
  const mode = useMode();
  return {
    ...view,
    mode,
    notices,
    range,
    setRange,
    locale,
    p,
    spark,
    traffic,
    memorySeries,
    chartRate,
    memoryBytes,
    trafficBounds,
    memoryBounds,
    trafficTimestamps: series.timestamps,
    memoryTimestamps: memoryHistory.timestamps,
    ready: !!capabilities.data,
    error: runtime.error ?? capabilities.error,
    retry: () => {
      capabilities.refetch();
      if (resources?.runtime.available) runtime.refetch();
    },
    showMemory: !!resources?.runtime_memory.available,
    history: {
      error: history.error,
      state: trafficState(series, resources?.traffic_history.available, !!history.data, offered(resources, 'runtime', {whileLoading: false}))
    },
    memoryState: {
      error: memory.error ?? memoryHistory.error,
      state: memoryHistory.samples.length > 1 ? 'ready' : resources?.runtime_memory.available === false ? 'unavailable' : 'loading'
    }
  };
}
