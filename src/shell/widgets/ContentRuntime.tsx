import {useContext, useMemo} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {formatBytes, formatBytesFraction, formatRate, formatCpu, localTime} from '../../i18n/format';
import {useCapabilities, useRuntime, useRuntimeMemory} from '../../store';
import {ResourceSamples} from '../../store/preview';
import type {Runtime, RuntimeMemory} from '../../api/model';
import {memoryTone} from '../../api/selectors';
import {parseU64, pctU64} from '../../api/u64';
import {window as ringWindow} from '../../api/rings';
import {useMemorySeries, useTrafficSeries} from '../../features/shared/useSeries';
import {foldCpu, seriesFacts, useCpuRing} from '../../features/shared/widgetSeries';
import {FactStrip, usePalette} from '../../ui/charts';
import {WidgetAreaChart} from '../../ui/charts/compact';
import {Badge, ErrorMessage, Kv, Meter} from '../../ui/ui';
import {sampleCpu} from './samples';
import {WideCell} from '../../ui/DashboardTile';
import {registry, WidgetSurface, type ModuleForm, type Widget} from './layout';
import {Reading} from './Reading';
import {scaleOf} from './dashboardSizing';

// A chart's legend carries the live value beside its colour, so a charted widget lists the rates once, there.
export const chartedRates = (item: Pick<Widget, 'id' | 'size'>, form: ModuleForm) => registry[item.id].rate === true && form !== 'kv' && item.size !== 'small';
// A dashboard card two thirds of a row or wider lists its chart's peak and average beside it (see dashboard.css): by its
// chosen width, or for Auto by the box its footprint has now.
function useWide(item: Widget) {
  const surface = useContext(WidgetSurface);
  const cell = useContext(WideCell);
  return surface === 'dashboard' && (item.width ? item.width === '2/3' || item.width === 'full' : cell);
}
export function RuntimeWidget({item, form}: {item: Widget; form: ModuleForm}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const wide = useWide(item);
  const runtime = useRuntime();
  const r = runtime.data;
  const rates = r?.traffic.rates;
  // A wide key-value card lists the same statistics as a wide chart, beside its readings.
  const listed = form === 'kv' && wide && item.id !== 'traffic';
  const chart = (statsOnly: boolean) =>
    item.id === 'cpu' ? (
      <CpuChart scale={scaleOf(item)} wide={wide} large={item.size === 'large' || item.size === 'wide'} form={form} runtime={r} statsOnly={statsOnly} />
    ) : (
      <TrafficChart
        scale={scaleOf(item)}
        wide={wide}
        large={item.size === 'large' || item.size === 'wide'}
        form={form}
        runtime={r}
        connections={item.id === 'connections'}
        direction={item.id}
        combine={item.id === 'speed' && !item.split}
        statsOnly={statsOnly}
      />
    );
  const readings = !chartedRates(item, form) && (
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
  );
  return (
    <Reading state={runtime}>
      {listed ? (
        <div className="rp-chart-stats">
          {readings}
          {chart(true)}
        </div>
      ) : (
        readings
      )}
      {item.id === 'traffic' && item.size !== 'small' && (
        <span className="rp-label rp-counter-since">{t('act.since', {time: localTime(r?.traffic.counter_since ?? null, locale)})}</span>
      )}
      {item.id !== 'traffic' && form !== 'kv' && item.size !== 'small' && chart(false)}
    </Reading>
  );
}
// The last minute of a ring, as a compact sparkline or a full area chart.
function HistoryChart({
  form,
  large,
  scale,
  wide,
  statsOnly,
  history,
  ...chart
}: {
  form: ModuleForm;
  large: boolean;
  scale?: number;
  wide?: boolean;
  statsOnly?: boolean;
  history?: {error?: Error | null; refetch: () => unknown};
  timestamps: number[];
  fmt: (n: number | null) => string;
  series: {label: string; color: string; values: (number | null)[]}[];
  combine?: boolean;
  widest?: string;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  if (statsOnly) return <FactStrip facts={seriesFacts(chart.series, chart.fmt, t)} />;
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
type ChartProps = {large: boolean; form: ModuleForm; scale?: number; wide?: boolean; combine?: boolean; statsOnly?: boolean};
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
// Past the narrowest size, the readings add the cgroup's use against its limit: a meter in the key-value form, text in
// a chart's, and the limit's absence named where there is no positive limit to measure against. Any form names the OOM
// kills when there were some. The panel's medium size keeps to these readings, and its chart starts at large.
export function MemoryWidget({item, form}: {item: Widget; form: ModuleForm}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const surface = useContext(WidgetSurface);
  const wide = useWide(item);
  const memory = useRuntimeMemory();
  const metrics = useCapabilities().data?.resources.runtime_memory?.metrics ?? [];
  const rss = metrics.includes('process.rss_bytes');
  const cgroup = metrics.includes('cgroup.current_bytes');
  const narrow = item.size === 'small';
  const used = memory.data?.cgroup?.current_bytes ?? null;
  const limit = memory.data?.cgroup?.limit_bytes ?? null;
  const limited = (parseU64(limit) ?? 0n) > 0n;
  const share = form === 'kv' && !narrow && limited ? pctU64(used, limit) : null;
  const kills = narrow ? null : parseU64(memory.data?.cgroup?.events?.oom_kill ?? null);
  const charted = form !== 'kv' && !narrow && (surface === 'dashboard' || item.size === 'large' || item.size === 'wide');
  const bytes = (value: string | null) => formatBytes(value, locale);
  // A listed limit that reads null means none is set, as on the overview; an absent one is not reported.
  const unlimited = metrics.includes('cgroup.limit_bytes') && memory.data?.cgroup?.limit_bytes === null;
  const readings = (
    <>
      <Kv
        compact
        row={!narrow}
        items={[
          ...(rss ? [[t('act.rss'), bytes(memory.data?.process?.rss_bytes ?? null)] as [string, string]] : []),
          ...(cgroup && share === null && (!narrow || !rss)
            ? [[t('act.cgroup'), !narrow && limited ? formatBytesFraction(used, limit, locale, t) : bytes(used)] as [string, string]]
            : []),
          ...(cgroup && !narrow && !limited ? [[t('ov.f.cgroupLimit'), t(unlimited ? 'ov.noLimit' : 'widgets.notReported')] as [string, string]] : [])
        ]}
      />
      {share !== null && <Meter label={t('act.cgroup')} value={share} valueLabel={formatBytesFraction(used, limit, locale, t)} tone={memoryTone(share)} />}
      {!!kills && <Badge tone="negative">{t('ui.valuePair', {label: t('ov.f.oomKill'), value: formatNumber(kills, locale)})}</Badge>}
      {!rss && !cgroup && <span className="rp-label">{t('widgets.unavailable')}</span>}
    </>
  );
  const chart = (statsOnly: boolean) => (
    <MemoryChart
      scale={scaleOf(item)}
      wide={wide}
      large={item.size === 'large' || item.size === 'wide'}
      form={form}
      memory={memory.data}
      rss={rss}
      cgroup={cgroup}
      statsOnly={statsOnly}
    />
  );
  return (
    <Reading state={memory}>
      {form === 'kv' && wide ? (
        <div className="rp-chart-stats">
          <div className="rp-col">{readings}</div>
          {chart(true)}
        </div>
      ) : (
        readings
      )}
      {charted && chart(false)}
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
