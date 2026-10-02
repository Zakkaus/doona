import {useContext, useMemo, type ReactNode} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {formatBytes, formatRate, formatCpu, formatDuration, formatLatency, localTime} from '../../i18n/format';
import {
  useCapabilities,
  useNodes,
  useProviders,
  useDnsLog,
  useRuntime,
  useRuntimeMemory,
  useConnections,
  useRuntimeOutbounds,
  useGroups,
  useGroupControl,
  useDatapath,
  useNoticeFeed,
  poll,
  reopenEvents
} from '../../store';
import type {ResourceState} from '../../store/resourceCore';
import {sampleCpu} from './samples';
import {ResourcePreview, ResourceSamples} from '../../store/preview';
import {getApi} from '../../api';
import type {Runtime, RuntimeMemory} from '../../api/model';
import {useRings, window as ringWindow} from '../../api/rings';
import {connectionRows, outboundLabel, outboundUsage, interestingNotice} from '../../api/selectors';
import {useMemorySeries, useTrafficSeries} from '../../features/shared/useSeries';
import {cpuSample, foldCpu} from '../../features/shared/widgetSeries';
import {connectionRanking} from '../../features/shared/ranking';
import {engineStatus} from '../../features/shared/engineStatus';
import {useMode} from '../../features/shared/useMode';
import {ModeSwitch, NoticeList, noticeRows, activityGroupView, nodeView, useActivityNode, GroupMenu, outboundColor} from '../../features/activity/widgets';
import {latencyAverages, latencyGroups, latencyMax, latencyPlotRow, latencySummary, providerRowView} from '../../features/nodes/widgets';
import {dnsAnalysis, dnsOutcomes} from '../../features/dns/widgets';
import {ranked} from '../../features/shared/ranked';
import {selectMember} from '../../features/shared/selectMember';
import {Donut, Waffle, MarkerPlot, usePalette} from '../../ui/charts';
import {WidgetAreaChart} from '../../ui/charts/compact';
import {Bar, Button, ChoiceMenu, ContextualHelp, Divider, Empty, ErrorMessage, Kv, Light, Link, Loading, Segmented} from '../../ui/ui';
import {href} from '../route';
import {contentLimit, canonicalForm, instanceId, registry, type ModuleForm, type Widget} from './layout';
import {saveLayout} from './settings';
import {saveDashboard} from './dashboardSettings';
import {mapWidgets} from './dashboardLayout';
import {WidgetRow, WidgetSpeed} from '../../ui/WidgetPanel';

function Reading<T>({state, children}: {state: ResourceState<T> & {refetch: () => unknown}; children: ReactNode}) {
  const t = useT();
  return (
    <>
      <ErrorMessage error={state.error} onRetry={state.refetch} />
      {state.error && state.data && <span className="rp-label">{t('widgets.stale')}</span>}
      {state.loading && !state.data ? <Loading /> : children}
    </>
  );
}
export function SpeedSummary() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const runtime = useRuntime(capabilities.data?.resources.runtime.available === true);
  const rates = runtime.data?.traffic.rates;
  return (
    <WidgetSpeed
      up={t('widgets.uploadSummary', {up: formatRate(rates?.upload_bytes_per_second ?? null, locale)})}
      down={t('widgets.downloadSummary', {down: formatRate(rates?.download_bytes_per_second ?? null, locale)})}
    />
  );
}
export function Contents({
  item,
  preview = false,
  dashboard = false,
  onChange
}: {
  item: Widget;
  preview?: boolean;
  dashboard?: boolean;
  onChange?: (item: Widget) => void;
}) {
  const form = canonicalForm(item, dashboard ? 'dashboard' : 'panel');
  item = {...item, form};
  switch (item.id) {
    case 'download':
    case 'upload':
    case 'history':
    case 'speed':
    case 'traffic':
    case 'connections':
    case 'cpu':
      return <RuntimeWidget item={item} form={form} />;
    case 'memory':
      return <MemoryWidget item={item} form={form} />;
    case 'ranking':
      return <RankingWidget item={item} />;
    case 'outbounds':
      return <OutboundWidget item={item} />;
    case 'global':
    case 'mode':
      return <ModeWidget preview={preview} targetOnly={item.id === 'global'} />;
    case 'latency':
      return <CurrentLatency item={item} dashboard={dashboard} onChange={onChange} />;
    case 'nodeLatency':
      return <Latency item={item} />;
    case 'sourceHealth':
      return <Sources item={item} />;
    case 'policyGroups':
      return <Groups item={item} />;
    case 'connectionOutbounds':
    case 'connectionNetworks':
      return <Connections item={item} />;
    case 'dnsAnswers':
      return <Dns item={item} />;
    case 'group':
      return <GroupWidget item={item} preview={preview} onChange={onChange} />;
    case 'status':
      return <StatusWidget item={item} />;
    case 'notices':
      return <NoticesWidget item={item} />;
    case 'divider':
      return <Divider orientation="horizontal" />;
    default:
      return null;
  }
}
const rateIds = ['speed', 'history', 'download', 'upload'];
// A chart's legend carries the live value beside its colour, so a charted widget lists the rates once, there.
export const chartedRates = (item: Pick<Widget, 'id' | 'size'>, form: ModuleForm) => rateIds.includes(item.id) && form !== 'kv' && item.size !== 'small';
function RuntimeWidget({item, form}: {item: Widget; form: ModuleForm}) {
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
              : rateIds.includes(item.id)
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
          <CpuChart large={item.size === 'large' || item.size === 'wide'} form={form} runtime={r} />
        ) : (
          <TrafficChart
            large={item.size === 'large' || item.size === 'wide'}
            form={form}
            runtime={r}
            connections={item.id === 'connections'}
            direction={item.id}
          />
        ))}
    </Reading>
  );
}
// The last minute of a ring, as a compact sparkline or a full area chart.
function HistoryChart({
  form,
  large,
  history,
  ...chart
}: {
  form: ModuleForm;
  large: boolean;
  history?: {error?: Error | null; refetch: () => unknown};
  timestamps: number[];
  fmt: (n: number | null) => string;
  series: {label: string; color: string; values: (number | null)[]}[];
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  return (
    <>
      {history && <ErrorMessage error={history.error} onRetry={history.refetch} />}
      <WidgetAreaChart size={form === 'sparkline' ? (large ? 'widget' : 'compact') : 'normal'} label={t('widgets.lastMinute')} locale={locale} {...chart} />
    </>
  );
}
type ChartProps = {large: boolean; form: ModuleForm};
function TrafficChart({runtime, connections, direction, ...props}: ChartProps & {runtime: Runtime | undefined; connections: boolean; direction: string}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const {history, series} = useTrafficSeries(useCapabilities().data, runtime, 60, {anchored: !!useContext(ResourceSamples)});
  return (
    <HistoryChart
      {...props}
      history={history}
      timestamps={series.timestamps}
      fmt={n => (connections ? (n == null ? '—' : formatNumber(n, locale)) : formatRate(n == null ? null : n * 1000, locale))}
      series={
        connections
          ? [{label: t('act.active'), color: p.cat[0], values: series.connections}]
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
  const passive = useContext(ResourcePreview);
  const ring = useRings('cpu', passive ? undefined : runtime, cpuSample, foldCpu, true, passive);
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
function MemoryWidget({item, form}: {item: Widget; form: ModuleForm}) {
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
        <MemoryChart large={item.size === 'large' || item.size === 'wide'} form={form} memory={memory.data} rss={rss} cgroup={cgroup} />
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
// One share chart for every module that splits a total: donut, waffle, ranked bars or key-value rows, by form.
type Share = {name: string; count: number; percent?: number; color?: string};
// The shares with a value, each with its percentage of their total unless it brings its own, and a colour.
export function shareRows(rows: Share[], colors: readonly string[]) {
  rows = rows.filter(row => row.count > 0);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {total, rows: rows.map((row, i) => ({...row, pct: row.percent ?? (row.count / total) * 100, color: row.color ?? colors[i % colors.length]}))};
}
function Shares({item, rows, bytes = false, empty}: {item: Widget; rows: Share[]; bytes?: boolean; empty: string}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const format = (value: number) => (bytes ? formatBytes(value, locale) : formatNumber(value, locale));
  const {total, rows: shown} = shareRows(rows, p.cat);
  const shares = shown.map(row => ({...row, text: format(row.count)}));
  const chart = {legendLimit: contentLimit(item.size), label: t(registry[item.id].label)};
  if (!total) return <Empty>{empty}</Empty>;
  if (item.form === 'donut') return <Donut {...chart} total={format(total)} rows={shares.map(row => ({...row, value: Math.round(row.pct)}))} />;
  if (item.form === 'waffle') return <Waffle {...chart} shares={shares.map(row => ({...row, id: row.name, label: row.name}))} />;
  return (
    <div className="rp-list">
      {shares
        .slice(0, contentLimit(item.size))
        .map(row =>
          item.form === 'ranked' ? (
            <Bar key={row.name} label={row.name} value={row.text} pct={row.pct} color={row.color} />
          ) : (
            <Kv truncate key={row.name} compact row={item.size !== 'small'} items={[[row.name, row.text]]} />
          )
        )}
    </div>
  );
}
function RankingWidget({item}: {item: Widget}) {
  const t = useT();
  const list = useConnections(undefined, true, false, poll.summary);
  const rows = useMemo(
    () => connectionRanking(list.data, item.by ?? 'dev').map(row => ({name: row.name, count: Number(row.download ?? 0n), percent: row.percent ?? undefined})),
    [list.data, item.by]
  );
  return (
    <Reading state={list}>
      <Shares item={item} rows={rows} bytes empty={t('ui.empty')} />
      {list.data?.truncated && <span className="rp-label">{t('widgets.sampled')}</span>}
    </Reading>
  );
}
function OutboundWidget({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useRuntimeOutbounds(true);
  const p = usePalette();
  const usage = useMemo(() => outboundUsage(resource.data), [resource.data]);
  const rows = usage.rows.map((row, i) => ({name: row.name, count: Number(row.bytes ?? 0n), color: outboundColor(row, i, p)}));
  return (
    <Reading state={resource}>
      <Shares item={item} rows={rows} bytes empty={t('ui.empty')} />
      {item.size !== 'small' && (
        <span className="rp-label rp-counter-since">{t('act.since', {time: localTime(resource.data?.counter_since ?? null, locale)})}</span>
      )}
    </Reading>
  );
}
function Connections({item}: {item: Widget}) {
  const t = useT();
  const resource = useConnections(undefined, true, false, poll.summary);
  const usage = useRuntimeOutbounds(item.id === 'connectionOutbounds');
  const palette = usePalette();
  const rows = useMemo(() => {
    const colors = new Map(outboundUsage(usage.data).rows.map((row, i) => [row.name, outboundColor(row, i, palette)]));
    const summary = ranked(
      connectionRows(resource.data).map(row => (item.id === 'connectionOutbounds' ? row.outbound : row.network)),
      6
    );
    return [
      ...summary.top.map(row => ({
        name: item.id === 'connectionOutbounds' ? outboundLabel(row.key, t) : (row.key ?? '—'),
        count: row.count,
        color: item.id === 'connectionOutbounds' ? colors.get(row.key ?? '') : undefined
      })),
      ...(summary.rest ? [{name: t('dashboard.other'), count: summary.rest}] : [])
    ];
  }, [resource.data, usage.data, palette, item.id, t]);
  return (
    <Reading state={resource}>
      <Shares item={item} rows={rows} empty={t('dashboard.noConnections')} />
      {resource.data?.truncated && <span className="rp-label">{t('widgets.sampled')}</span>}
    </Reading>
  );
}
function Dns({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useDnsLog({});
  const analysis = useMemo(() => dnsAnalysis(resource.data?.records ?? [], locale), [resource.data, locale]);
  return (
    <Reading state={resource}>
      <Shares
        item={item}
        rows={dnsOutcomes.map(outcome => ({name: t(`dns.outcome.${outcome}`), count: analysis.counts[outcome]}))}
        empty={t('dashboard.noQueries')}
      />
      {analysis.total > 0 && <span className="rp-label">{t('dashboard.dnsSample', {n: analysis.total})}</span>}
    </Reading>
  );
}
function ModeWidget({preview, targetOnly}: {preview: boolean; targetOnly: boolean}) {
  const t = useT();
  const m = useMode();
  return (
    <>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {!targetOnly && <ModeSwitch model={{...m, writable: !preview && m.writable}} />}
      {(targetOnly || m.mode === 'global') && (
        <WidgetRow label={t('act.global')}>
          <ChoiceMenu
            quiet
            label={t('act.global')}
            value={m.target}
            onChange={m.pickTarget}
            isDisabled={preview || m.busy || !m.writable}
            items={m.targets}
            searchLabel={t('ui.filterOutbounds')}
          >
            {m.targetText}
          </ChoiceMenu>
        </WidgetRow>
      )}
      {m.incomplete && <span className="rp-label">{t('act.globalMissing')}</span>}
    </>
  );
}
// Works without setup: the first manual group until the card picks another; with none, one jump to create a group.
export const cardGroup = <G extends {id: string; policy: {kind: string}}>(groups: readonly G[] | undefined, chosen: string | undefined) =>
  groups?.find(group => group.id === chosen) ?? groups?.find(group => group.policy.kind === 'selector');
function GroupWidget({item, preview, onChange}: {item: Widget; preview: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  const groups = useGroups();
  const selected = cardGroup(groups.data, item.group);
  return (
    <Reading state={groups}>
      {selected ? (
        <>
          <WidgetRow label={t('widgets.group')}>
            <ChoiceMenu
              quiet
              label={t('ui.group')}
              value={selected.id}
              isDisabled={preview || !onChange}
              items={(groups.data ?? []).map(group => ({id: group.id, label: group.name}))}
              onChange={group => onChange?.({...item, group})}
              searchLabel={t('ui.filterGroups')}
            >
              {selected.name}
            </ChoiceMenu>
          </WidgetRow>
          <GroupControl id={selected.id} refresh={groups.refetch} preview={preview} />
        </>
      ) : (
        <Empty>
          {t('widgets.noManualGroup')}
          <Link appearance="button" small href={href('policies', {new: '1'})}>
            {t('group.newGroup')}
          </Link>
        </Empty>
      )}
    </Reading>
  );
}
function GroupControl({id, refresh, preview}: {id: string; refresh: () => unknown; preview: boolean}) {
  const t = useT();
  const control = useGroupControl(id, refresh, () => {});
  const g = control.data;
  const network = control.network;
  const selection = g?.runtime.selection;
  const selected =
    network === 'both' ? (selection?.tcp?.member_id === selection?.udp?.member_id ? selection?.tcp?.member_id : '') : selection?.[network]?.member_id;
  const canSelect = !!g && (g.capabilities.can_select || g.capabilities.can_override);
  const overridden = network === 'both' ? [selection?.tcp, selection?.udp].some(s => s?.source === 'override') : selection?.[network]?.source === 'override';
  const name = (member: string | undefined) => g?.members.find(m => m.id === member)?.name ?? '—';
  return (
    <Reading state={control}>
      <ErrorMessage error={control.actionError} />
      <Segmented
        label={t('widgets.network')}
        value={network}
        onChange={value => control.setNetwork(value as typeof network)}
        isDisabled={preview || !!control.busy}
        items={[
          ['both', t('policy.both')],
          ['tcp', 'TCP'],
          ['udp', 'UDP']
        ]}
      />
      {/* With both networks on different members, the member row has no single value, so each network shows its own. */}
      {selected === '' && (
        <Kv
          compact
          row
          items={[
            ['TCP', name(selection?.tcp?.member_id)],
            ['UDP', name(selection?.udp?.member_id)]
          ]}
        />
      )}
      <WidgetRow label={t('widgets.member')}>
        <ChoiceMenu
          quiet
          searchLabel={t('ui.filterMembers')}
          label={t('widgets.member')}
          value={selected ?? ''}
          isDisabled={preview || !!control.busy || !canSelect}
          items={(g?.members ?? []).map(m => ({id: m.id, label: m.name}))}
          onChange={member => selectMember(control.select, member, selected, g?.name, name, t)}
        >
          {name(selected)}
        </ChoiceMenu>
      </WidgetRow>
      {g?.capabilities.can_override && overridden && (
        <Button small isDisabled={preview} isPending={control.busy === 'selection'} onPress={() => void control.clearOverride()}>
          {t('policy.releaseOverride')}
        </Button>
      )}
      {!canSelect && <span className="rp-label">{t('widgets.readOnly')}</span>}
    </Reading>
  );
}
function StatusWidget({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const runtime = useRuntime();
  const path = useDatapath(useCapabilities().data?.resources.datapath?.available === true);
  const status = engineStatus(runtime.data?.lifecycle.state, path.data?.state, '—', t);
  return (
    <Reading state={runtime}>
      <ErrorMessage error={path.error} onRetry={path.refetch} />
      <Light tone={status.tone}>{status.text}</Light>
      <Kv compact row={item.size !== 'small'} items={[[t('widgets.uptime'), formatDuration(runtime.data?.lifecycle.uptime_seconds ?? null, locale)]]} />
    </Reading>
  );
}
function NoticesWidget({item}: {item: Widget}) {
  const api = getApi();
  const t = useT();
  const feed = useNoticeFeed(interestingNotice);
  const records = feed.records;
  const rows = noticeRows(records, t).slice(0, contentLimit(item.size));
  return (
    <>
      <ErrorMessage error={feed.error} onRetry={() => reopenEvents(api)} />
      {!rows.length ? (
        <span className="rp-label">{t('widgets.noNotices')}</span>
      ) : (
        <>
          <NoticeList rows={rows} label={t('act.issues')} />
          <Link appearance="link" href={href('events')}>
            {t('widgets.noticeCount', {n: records.length})}
          </Link>
        </>
      )}
    </>
  );
}
function CurrentLatency({item, dashboard, onChange}: {item: Widget; dashboard: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  const vm = useActivityNode(undefined, {
    chosen: item.group ?? '',
    setChosen: group => {
      if (onChange) onChange({...item, group});
      else if (dashboard) saveDashboard(previous => mapWidgets(previous, old => (instanceId(old) === instanceId(item) ? {...old, group} : old)));
      else saveLayout(previous => ({...previous, items: previous.items.map(old => (instanceId(old) === instanceId(item) ? {...old, group} : old))}));
    }
  });
  return (
    <>
      <div className="rp-cluster">
        <GroupMenu label={t('policy.pickGroups')} model={vm} />
        <ContextualHelp title={t('act.latency')} text={t('act.groupPickHelp')} />
      </div>
      <ErrorMessage error={vm.error} onRetry={vm.retry} />
      <Kv truncate compact row={item.size !== 'small'} items={[[vm.name || '—', vm.status ?? vm.latency]]} />
    </>
  );
}

function Latency({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(resources?.nodes.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const view = useMemo(
    () => latencyGroups(nodes.data ?? [], groups.data, 'group', locale).filter(group => !item.group || group.id === `group:${item.group}`),
    [nodes.data, groups.data, item.group, locale]
  );
  const {measured, missing} = latencySummary(view);
  const averages = latencyAverages(view);
  // A gallery preview shows the summary and the first rows whole inside its frame.
  const limit = useContext(ResourceSamples) ? 3 : contentLimit(item.size, [3, 6, 12]);
  return (
    <Reading state={{...nodes, error: nodes.error ?? groups.error, refetch: () => (nodes.refetch(), groups.refetch())}}>
      {!view.length ? (
        <Empty>{t('dashboard.noNodes')}</Empty>
      ) : item.form === 'dots' ? (
        <>
          <span className="rp-label">{t('dashboard.latencyOrder')}</span>
          <Kv
            truncate
            compact
            row={item.size !== 'small'}
            items={[
              [t('nodes.latency.lowest'), formatLatency(measured[0]?.latest ?? null, t)],
              [t('nodes.latency.highest'), formatLatency(measured.at(-1)?.latest ?? null, t)]
            ]}
          />
          <MarkerPlot
            label={t('ui.nodeLatency')}
            max={latencyMax(view)}
            fmt={value => formatLatency(value, t)}
            limit={limit}
            showAll={n => t('nodes.latency.showAll', {n})}
            legend={
              averages.moving || averages.avg10
                ? [
                    {kind: 'dot', label: t('nodes.latency.latest')},
                    {kind: 'ring', label: t('nodes.latency.average')},
                    {kind: 'line', label: t('nodes.latency.range')}
                  ]
                : []
            }
            groups={[
              {
                id: 'nodes',
                label: item.group ? (view[0]?.label ?? t('nodes.latency.noGroup')) : t('dashboard.allGroups'),
                rows: measured.map(row => latencyPlotRow(row, t)),
                notes: missing.map(row => t('ui.valuePair', {label: row.name, value: t(row.state === 'unavailable' ? 'act.unavailable' : 'act.unknown')}))
              }
            ]}
          />
        </>
      ) : (
        <div className="rp-list">
          {measured.slice(0, limit).map(row => (
            <Kv truncate key={row.id} compact row={item.size !== 'small'} items={[[row.name, formatLatency(row.latest, t)]]} />
          ))}
          {missing.slice(0, Math.max(0, limit - measured.length)).map(row => (
            <Kv
              truncate
              key={row.id}
              compact
              row={item.size !== 'small'}
              items={[[row.name, t(row.state === 'unavailable' ? 'act.unavailable' : 'act.unknown')]]}
            />
          ))}
        </div>
      )}
    </Reading>
  );
}
function Sources({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useProviders();
  return (
    <Reading state={resource}>
      {!resource.data?.providers.length ? (
        <Empty>{t('dashboard.noSources')}</Empty>
      ) : (
        resource.data.providers.map(provider => {
          const row = providerRowView(provider, undefined, locale, t);
          return <Kv truncate key={row.id} compact row={item.size !== 'small'} items={[[row.name, row.status ?? '—']]} />;
        })
      )}
    </Reading>
  );
}
function Groups({item}: {item: Widget}) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const rows = activityGroupView(groups.data ?? [], nodes.data ?? [], '', t).options.filter(group => !item.group || group.id === item.group);
  return (
    <Reading state={{...groups, error: groups.error ?? nodes.error, refetch: () => (groups.refetch(), nodes.refetch())}}>
      {!rows.length ? (
        <Empty>{t('dashboard.noGroups')}</Empty>
      ) : (
        rows.slice(0, contentLimit(item.size)).map(group => {
          const health = nodeView(group.node ? [group.node] : [], '', t);
          return (
            <Kv
              truncate
              key={group.id}
              compact
              row={item.size !== 'small'}
              items={[[group.label, t('ui.valuePair', {label: group.node?.name ?? '—', value: health.status ?? health.latency})]]}
            />
          );
        })
      )}
    </Reading>
  );
}
