import {useContext, useMemo} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {formatBytes, formatRate, formatCpu, localTime} from '../../i18n/format';
import {useCapabilities, useRuntime, useRuntimeMemory} from '../../store';
import {ResourceSamples} from '../../store/preview';
import type {Runtime, RuntimeMemory} from '../../api/model';
import {window as ringWindow} from '../../api/rings';
import {useMemorySeries, useTrafficSeries} from '../../features/shared/useSeries';
import {foldCpu, seriesFacts, useCpuRing} from '../../features/shared/widgetSeries';
import {FactStrip, usePalette} from '../../ui/charts';
import {WidgetAreaChart} from '../../ui/charts/compact';
import {ErrorMessage, Kv} from '../../ui/ui';
import {sampleCpu} from './samples';
import {registry, type ModuleForm, type Widget} from './layout';
import {Reading} from './Reading';
import {scaleOf} from './dashboardSizing';

// A chart's legend carries the live value beside its colour, so a charted widget lists the rates once, there.
export const chartedRates = (item: Pick<Widget, 'id' | 'size'>, form: ModuleForm) => registry[item.id].rate === true && form !== 'kv' && item.size !== 'small';
// A card two thirds of a row or wider lists its chart's peak and average beside it (see dashboard.css).
const wide = (item: Widget) => item.width === '2/3' || item.width === 'full';
export function RuntimeWidget({item, form}: {item: Widget; form: ModuleForm}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const runtime = useRuntime();
  const r = runtime.data;
  const rates = r?.traffic.rates;
  return (
    <Reading state={runtime}>
      {!chartedRates(item, form) && (
        <Kv
          compact
          row={item.size !== 'small'}
          items={
            item.id === 'traffic'
              ? [
                  [t('ui.download'), formatBytes(r?.traffic.bytes.download ?? null, locale)],
                  ...(item.size === 'small' ? [] : [[t('ui.upload'), formatBytes(r?.traffic.bytes.upload ?? null, locale)] as [string, string]])
                ]
              : registry[item.id].rate
                ? [
                    [
                      t(item.id === 'upload' ? 'ui.upload' : 'ui.download'),
                      formatRate((item.id === 'upload' ? rates?.upload_bytes_per_second : rates?.download_bytes_per_second) ?? null, locale)
                    ],
                    ...(item.size === 'small' || item.id === 'download' || item.id === 'upload'
                      ? []
                      : [[t('ui.upload'), formatRate(rates?.upload_bytes_per_second ?? null, locale)] as [string, string]])
                  ]
                : [
                    [
                      t(item.id === 'cpu' ? 'act.cpu' : 'act.active'),
                      item.id === 'cpu'
                        ? formatCpu(r?.process.cpu_percent, t)
                        : r?.traffic.connections.total == null
                          ? '—'
                          : formatNumber(r.traffic.connections.total, locale)
                    ]
                  ]
          }
        />
      )}
      {item.id === 'traffic' && item.size !== 'small' && (
        <span className="rp-label rp-counter-since">{t('act.since', {time: localTime(r?.traffic.counter_since ?? null, locale)})}</span>
      )}
      {item.id !== 'traffic' &&
        form !== 'kv' &&
        item.size !== 'small' &&
        (item.id === 'cpu' ? (
          <CpuChart scale={scaleOf(item)} wide={wide(item)} large={item.size === 'large' || item.size === 'wide'} form={form} runtime={r} />
        ) : (
          <TrafficChart
            scale={scaleOf(item)}
            wide={wide(item)}
            large={item.size === 'large' || item.size === 'wide'}
            form={form}
            runtime={r}
            connections={item.id === 'connections'}
            direction={item.id}
            combine={item.id === 'speed' && !item.split}
          />
        ))}
    </Reading>
  );
}
// The last minute of a ring, as a compact sparkline or a full area chart.
function HistoryChart({
  form,
  large,
  scale,
  wide,
  history,
  ...chart
}: {
  form: ModuleForm;
  large: boolean;
  scale?: number;
  wide?: boolean;
  history?: {error?: Error | null; refetch: () => unknown};
  timestamps: number[];
  fmt: (n: number | null) => string;
  series: {label: string; color: string; values: (number | null)[]}[];
  combine?: boolean;
  widest?: string;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  return (
    <>
      {history && <ErrorMessage error={history.error} onRetry={history.refetch} />}
      <div className="rp-chart-stats">
        <WidgetAreaChart
          size={form === 'sparkline' ? (large ? 'widget' : 'compact') : 'normal'}
          scale={scale}
          label={t('widgets.lastMinute')}
          locale={locale}
          {...chart}
        />
        {wide && <FactStrip facts={seriesFacts(chart.series, chart.fmt, t)} />}
      </div>
    </>
  );
}
type ChartProps = {large: boolean; form: ModuleForm; scale?: number; wide?: boolean; combine?: boolean};
function TrafficChart({runtime, connections, direction, ...props}: ChartProps & {runtime: Runtime | undefined; connections: boolean; direction: string}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const {history, series} = useTrafficSeries(useCapabilities().data, runtime, 60, {anchored: !!useContext(ResourceSamples)});
  return (
    <HistoryChart
      {...props}
      widest={connections ? undefined : formatRate(888e6, locale)}
      history={history}
      timestamps={series.timestamps}
      fmt={n => (connections ? (n == null ? '—' : formatNumber(n, locale)) : formatRate(n == null ? null : n * 1000, locale))}
      series={
        connections
          ? [{label: t('act.active'), color: p.cat[2], values: series.connections}]
          : [
              ...(direction === 'upload' ? [] : [{label: t('ui.download'), color: p.cat[0], values: series.down}]),
              ...(direction === 'download' ? [] : [{label: t('ui.upload'), color: p.cat[3], values: series.up}])
            ]
      }
    />
  );
}
function CpuChart({runtime, ...props}: ChartProps & {runtime: Runtime | undefined}) {
  const t = useT();
  const p = usePalette();
  const preview = useContext(ResourceSamples);
  const ring = useCpuRing(runtime);
  const fallback = !!preview && !ring.fine.length && !ring.coarse.length;
  const series = useMemo(
    () => ringWindow(ring, fallback ? sampleCpu : [], 60, foldCpu, preview ? (fallback ? sampleCpu.at(-1)?.time : ring.fine.at(-1)?.time) : undefined),
    [ring, preview, fallback]
  );
  return (
    <HistoryChart
      {...props}
      timestamps={series.samples.map(s => s.time)}
      fmt={n => formatCpu(n, t)}
      series={[{label: t('act.cpu'), color: p.cat[0], values: series.samples.map(s => s.value)}]}
    />
  );
}
export function MemoryWidget({item, form}: {item: Widget; form: ModuleForm}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const memory = useRuntimeMemory();
  const metrics = useCapabilities().data?.resources.runtime_memory?.metrics ?? [];
  const rss = metrics.includes('process.rss_bytes');
  const cgroup = metrics.includes('cgroup.current_bytes');
  return (
    <Reading state={memory}>
      <Kv
        compact
        row={item.size !== 'small'}
        items={[
          ...(rss ? [[t('act.rss'), formatBytes(memory.data?.process?.rss_bytes ?? null, locale)] as [string, string]] : []),
          ...(cgroup && (item.size !== 'small' || !rss)
            ? [[t('act.cgroup'), formatBytes(memory.data?.cgroup?.current_bytes ?? null, locale)] as [string, string]]
            : [])
        ]}
      />
      {!rss && !cgroup && <span className="rp-label">{t('widgets.unavailable')}</span>}
      {form !== 'kv' && item.size !== 'small' && (
        <MemoryChart
          scale={scaleOf(item)}
          wide={wide(item)}
          large={item.size === 'large' || item.size === 'wide'}
          form={form}
          memory={memory.data}
          rss={rss}
          cgroup={cgroup}
        />
      )}
    </Reading>
  );
}
function MemoryChart({memory, rss, cgroup, ...props}: ChartProps & {memory: RuntimeMemory | undefined; rss: boolean; cgroup: boolean}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const series = useMemorySeries(useCapabilities().data, memory, {windowSeconds: 60, anchored: !!useContext(ResourceSamples)});
  return (
    <HistoryChart
      {...props}
      history={{error: series.error, refetch: series.retry}}
      timestamps={series.timestamps}
      fmt={n => formatBytes(n ?? null, locale)}
      series={[
        ...(rss ? [{label: t('act.rss'), color: p.cat[0], values: series.rss}] : []),
        ...(cgroup ? [{label: t('act.cgroup'), color: p.cat[3], values: series.cgroup}] : [])
      ]}
    />
  );
}
