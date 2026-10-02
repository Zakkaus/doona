import {useCallback, useMemo, useState} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useVersion} from '../../store';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {formatBytes, formatRate} from '../../i18n/format';
import {usePalette} from '../../ui/charts';
import {useMemorySeries, useTrafficSeries} from '../shared/useSeries';
import {isTrafficRange, trafficRanges, trafficWindow, type TrafficRange} from '../shared/traffic';
import {activityView, trafficState} from './view';
import {offered} from '../../api/capabilities';
import {backendLimits} from '../shared/limits';

export function useActivity(kind: 'download' | 'upload' | 'connections' | 'cpu' | 'history' | 'memory' | 'status' = 'history') {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const p = usePalette();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(kind !== 'memory' && offered(resources, 'runtime', {whileLoading: false}));
  const memory = useRuntimeMemory(kind === 'memory' && offered(resources, 'runtime_memory', {whileLoading: false}));
  const datapath = useDatapath(kind === 'status' && offered(resources, 'datapath', {whileLoading: false}));
  const [range, setRange] = useState<TrafficRange>('live');
  const windowSeconds = trafficRanges[range].seconds;
  const memoryHistory = useMemorySeries(capabilities.data, memory.data, {enabled: kind === 'memory'});
  const {
    history,
    rings: polledTraffic,
    samples: historySamples,
    series
  } = useTrafficSeries(capabilities.data, runtime.data, windowSeconds, {enabled: ['download', 'upload', 'connections', 'history'].includes(kind)});
  const spark = useMemo(() => trafficWindow(polledTraffic, historySamples, trafficRanges.live.seconds, undefined, 24), [polledTraffic, historySamples]);
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
  const ranges = useMemo(() => (Object.keys(trafficRanges) as TrafficRange[]).map((id): [string, string] => [id, t(trafficRanges[id].label)]), [t]);
  const pickRange = useCallback((value: string) => {
    if (isTrafficRange(value)) setRange(value);
  }, []);
  const trafficBounds = useMemo(() => ({since: series.since, until: series.until}), [series.since, series.until]);
  const memoryBounds = useMemo(() => ({since: memoryHistory.since, until: memoryHistory.until}), [memoryHistory.since, memoryHistory.until]);
  // Traffic series are in KB/s.
  const chartRate = useCallback((value: number | null | undefined) => formatRate(value == null ? null : value * 1000, locale), [locale]);
  const count = useCallback((value: number) => formatNumber(value, locale), [locale]);
  const memoryBytes = useCallback((value: number | null | undefined) => formatBytes(value ?? null, locale), [locale]);
  const view = useMemo(
    () => activityView(runtime.data, t, resources?.runtime.available, locale, datapath.data?.state),
    [runtime.data, t, resources?.runtime.available, locale, datapath.data?.state]
  );
  const version = useVersion(kind === 'status');
  const {refetch: refetchRuntime} = runtime;
  const {refetch: refetchDatapath} = datapath;
  const retry = useCallback(() => {
    void refetchRuntime();
    void refetchDatapath();
  }, [refetchRuntime, refetchDatapath]);
  // System status lists these with their reasons; here the status card only counts them.
  const limited = useMemo(
    () =>
      kind === 'status' && capabilities.data ? backendLimits(capabilities.data, version.data, t, lang).reduce((n, group) => n + group.items.length, 0) : 0,
    [kind, capabilities.data, version.data, t, lang]
  );
  return {
    ...view,
    limited: limited > 0 ? t('act.limited', {n: limited}) : null,
    range,
    ranges,
    setRange: pickRange,
    locale,
    p,
    spark,
    traffic,
    memorySeries,
    chartRate,
    count,
    memoryBytes,
    trafficBounds,
    memoryBounds,
    trafficTimestamps: series.timestamps,
    memoryTimestamps: memoryHistory.timestamps,
    ready: !!capabilities.data,
    // The shell reports a failed discovery above every page; this page reports only its own reads.
    discoveryFailed: !!capabilities.error,
    error: runtime.error ?? datapath.error,
    // The last figures stay while a read fails, marked as out of date.
    stale: !!runtime.error && !!runtime.data,
    retry,
    history: {
      error: history.error,
      retry: history.refetch,
      state: trafficState(series, resources?.traffic_history.available, !!history.data, offered(resources, 'runtime', {whileLoading: false}))
    },
    memoryState: {
      error: memory.error ?? memoryHistory.error,
      retry: memory.error ? memory.refetch : memoryHistory.retry,
      state: memoryHistory.samples.length > 1 ? 'ready' : resources?.runtime_memory.available === false ? 'unavailable' : 'loading'
    }
  };
}
