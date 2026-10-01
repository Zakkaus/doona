import type {ApiEvent, ConnectionList, Datapath, Group, GroupSummary, Node, Runtime, RuntimeOutbounds} from '../../api/model';
import {latencyTone} from '../../ui/ui';
import {enumLabel} from '../../i18n/enum';
import {backendCode} from '../../i18n/backend';
import {isBuiltinOutbound} from '../../dae/vocab';
import {
  connectionRows,
  eventKindLabels,
  eventSummary,
  healthMillis,
  outboundLabel,
  outboundUsage,
  preferredHealth,
  resolveSelectedLeaf,
  routineGap,
  shortId
} from '../../api/selectors';
import {localTime, formatBytes, formatRate, formatLatency, formatCpu} from '../../i18n/format';
import {formatNumber, type Key, type Translator as LabelFn} from '../../i18n';
import {connectionRanking} from './ranking';
import {sameMode, type OutboundMode} from '../../dae/outboundMode';
import {engineStatus} from '../shared/engineStatus';
import {href} from '../../shell/route';

export const modeLabels = {rule: 'mode.rule', direct: 'mode.direct', global: 'mode.global'} as const;
export function modeView(
  current: OutboundMode,
  staged: OutboundMode | null,
  groups: Array<Pick<Group, 'name'>>,
  writable: boolean,
  configAvailable: boolean,
  t: LabelFn,
  known = true
) {
  const shown = writable ? (staged ?? current) : current;
  const target = shown.mode === 'global' ? shown.target : ((current.mode === 'global' ? current.target : groups[0]?.name) ?? '');
  return {
    mode: known ? shown.mode : '',
    target: known ? target : '',
    targetText: known ? target || '—' : '—',
    writable,
    dirty: writable && staged !== null && !sameMode(staged, current),
    // Global mode needs a group to send everything to; without one there is nothing valid to write.
    incomplete: shown.mode === 'global' && !target,
    status: t(configAvailable ? 'act.modeReadOnly' : 'act.modeUnavailable'),
    readOnly: configAvailable && !writable,
    modes: (['rule', 'direct', 'global'] as const).map(mode => [mode, t(modeLabels[mode])] as [string, string]),
    targets: groups.map(group => ({id: group.name, label: group.name}))
  };
}
// Why the mode card's Apply and the global target are disabled, each under its own card; an Apply with nothing to apply
// needs no line, the disabled button says so. A read-only backend's status
// already sits beside the mode switch, so only the global target repeats it. Null while they can be used or a change is
// being applied.
export function modeReasons(
  {writable, incomplete, status}: Pick<ReturnType<typeof modeView>, 'writable' | 'incomplete' | 'status'>,
  busy: boolean,
  t: LabelFn
): {mode: string | null; global: string | null} {
  if (busy) return {mode: null, global: null};
  if (!writable) return {mode: null, global: status};
  return {mode: incomplete ? t('act.globalMissing') : null, global: null};
}
export type NoticeRow = {id: string; tone: 'warn' | 'info'; kindText: string; summaryText: string; action?: {label: string; href: string}};
// What the backend still lacks before it routes through a proxy, listed ahead of the event notices until it is added.
export function setupNotices({noNodeSources, noRouting}: {noNodeSources: boolean; noRouting: boolean}, t: LabelFn): NoticeRow[] {
  const notice = (id: string, summary: Key, action: NoticeRow['action']): NoticeRow => ({
    id,
    tone: 'info',
    kindText: t('ui.notice'),
    summaryText: t(summary),
    action
  });
  return [
    ...(noNodeSources ? [notice('setup:nodes', 'act.noSubscriptions', {label: t('nodes.addProvider'), href: href('nodes')})] : []),
    ...(noRouting
      ? [notice('setup:routing', 'act.noRoutingMode', {label: t('act.chooseRoutingMode'), href: href('rules', {tab: 'list', view: 'simple'})})]
      : [])
  ];
}
export const interestingNotice = (event: ApiEvent) => event.event !== 'runtime.updated' && event.event !== 'flow.updated' && !routineGap(event);

// The home card holds this many rows; the rest is one click away on the events page.
const NOTICE_ROWS = 8;
// A run of identical notices (same kind, same resource, same reason) folds into one row with a count, so a
// backend dropping records at pace does not push everything else off the card. Two notices that differ in
// any of those never fold: a failure must not disappear behind a neighbouring success.
export function noticeRows(events: ApiEvent[], t: LabelFn) {
  const rows: Array<{id: string; tone: 'warn' | 'info'; kindText: string; summaryText: string; key: string; count: number}> = [];
  for (const event of events) {
    const summary = eventSummary(event, t);
    const key = [event.event, summary.key, ...Object.entries(summary.params ?? {}).map(([name, value]) => `${name}=${String(value)}`)].join('|');
    const last = rows[rows.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      continue;
    }
    if (rows.length === NOTICE_ROWS) break;
    const params = Object.fromEntries(Object.entries(summary.params ?? {}).map(([key, value]) => [key, typeof value === 'string' ? shortId(value) : value]));
    rows.push({
      id: event.id,
      tone: event.event === 'flow.gap' ? ('warn' as const) : ('info' as const),
      kindText: t(event.event === 'flow.gap' ? 'ui.warning' : 'ui.notice'),
      summaryText: t('ui.valuePair', {label: enumLabel(eventKindLabels, event.event, t), value: t(summary.key, params)}),
      key,
      count: 1
    });
  }
  return rows.map(({key: _key, count, summaryText, ...row}) => ({
    ...row,
    summaryText: count > 1 ? t('ui.aside', {text: summaryText, note: t('act.noticeRepeat', {n: count})}) : summaryText
  }));
}
export function trafficState(series: {down: Array<number | null>; up: Array<number | null>}, available: boolean | undefined, loaded: boolean, live = false) {
  if (series.down.some(value => value !== null) || series.up.some(value => value !== null)) return 'ready';
  if (available === false) return live ? 'loading' : 'unavailable';
  return !loaded ? 'loading' : 'empty';
}

export function nodeView(nodes: Node[], chosen: string, t: LabelFn) {
  const node =
    nodes.find(n => n.id === chosen) ??
    nodes.find(n => healthMillis(preferredHealth(n)) !== undefined) ??
    nodes.find(n => !isBuiltinOutbound(n.name)) ??
    nodes[0];
  const health = node && preferredHealth(node);
  const tcp = healthMillis(health);
  const alive = health?.state === 'healthy';
  const unavailable = health?.state === 'unavailable';
  return {
    id: node?.id ?? '',
    name: node?.name ?? '',
    latency: alive && tcp !== undefined ? formatLatency(tcp, t) : '—',
    // A measured value takes the tone the nodes table gives it.
    latencyClass: alive && tcp !== undefined ? `rp-big ms ${latencyTone(tcp)}` : 'rp-big',
    tone: alive ? ('ok' as const) : unavailable ? ('err' as const) : ('muted' as const),
    // A healthy node's latency says so; the light names only what the value cannot, an unavailable or unknown node.
    status: alive ? null : t(unavailable ? 'act.unavailable' : 'act.unknown'),
    healthError: health?.error ? backendCode(health.error, t) : undefined
  };
}
export function activityGroupView(groups: GroupSummary[], nodes: Node[], chosen: string, t: LabelFn, connections?: ConnectionList) {
  const byName = new Map(groups.map(group => [group.name, group]));
  const byId = new Map(groups.map(group => [group.id, group]));
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const options = groups.map(group => {
    // Follow one transport through nested selections, as the routing tree does.
    const selected = resolveSelectedLeaf(group.name, group.selection.tcp_member_id ? 'tcp' : 'udp', byName, byId, nodesById);
    const node = selected.node;
    return {
      id: group.id,
      label: group.name,
      node
    };
  });
  const active = new Map<string, number>();
  for (const connection of connectionRows(connections)) {
    // Outbound grouping keys on the backend's outbound name, not the leaf in its chain.
    if (connection.state === 'active' && connection.outbound) active.set(connection.outbound, (active.get(connection.outbound) ?? 0) + 1);
  }
  let busiest: (typeof options)[number] | undefined;
  for (const option of options) {
    if ((active.get(option.label) ?? 0) > (active.get(busiest?.label ?? '') ?? 0)) busiest = option;
  }
  const stored = options.find(option => option.id === chosen);
  const group = stored ?? busiest ?? options.find(option => option.node && healthMillis(preferredHealth(option.node)) !== undefined) ?? options[0];
  const view = nodeView(group ? (group.node ? [group.node] : []) : nodes, '', t);
  return {
    ...view,
    options,
    chosen: stored?.id ?? ''
  };
}
export type ActivityGroupMenu = Pick<ReturnType<typeof activityGroupView>, 'options' | 'name' | 'chosen'>;

export function activityView(runtime: Runtime | undefined, t: LabelFn, runtimeAvailable?: boolean, locale = 'en', datapath?: Datapath['state']) {
  // The status the System status page shows; the card's own link already leads there, so the status carries no link of its own.
  const {tone, text} = engineStatus(runtime?.lifecycle.state, datapath, t(runtimeAvailable === false ? 'act.modeUnavailable' : 'ui.loading'), t);
  return {
    status: {tone, text},
    download: formatRate(runtime?.traffic.rates?.download_bytes_per_second ?? null, locale),
    upload: formatRate(runtime?.traffic.rates?.upload_bytes_per_second ?? null, locale),
    connections: runtime?.traffic.connections.total == null ? '—' : formatNumber(runtime.traffic.connections.total, locale),
    cpu: formatCpu(runtime?.process.cpu_percent, t),
    cpuHelp: {title: t('act.cpu'), text: t('act.cpuHelp')}
  };
}

export function activityOutbounds(outbounds: RuntimeOutbounds | undefined, locale: string, colors: {cat: string[]; love: string}, t: LabelFn) {
  const usage = outboundUsage(outbounds);
  return {
    since: outbounds ? t('act.since', {time: localTime(outbounds.counter_since, locale)}) : '',
    total: formatBytes(usage.total, locale),
    rows: usage.rows.map((row, i) => ({
      name: outboundLabel(row.name, t),
      value: row.percent === null ? null : Math.round(row.percent),
      text: formatBytes(row.bytes, locale),
      // The connections through this outbound now; the usage counts since the counters started.
      href: href('connections', {out: row.name}),
      color: row.kind === 'builtin' && row.name === 'block' ? colors.love : colors.cat[i % colors.cat.length]
    }))
  };
}

export function activityRanking(connections: ConnectionList | undefined, by: string, colors: {cat: string[]}, locale: string, t: LabelFn) {
  return connectionRanking(connections, by).map((row, i) => ({
    name: row.name,
    value: row.percent === null ? formatBytes(row.download, locale) : t('ui.share', {bytes: formatBytes(row.download, locale), percent: row.percent}),
    pct: row.percent ?? 0,
    color: colors.cat[i % colors.cat.length],
    // The connection list filtered to the device, or searched for the domain or address.
    href: href('connections', by === 'dev' ? {src: row.name} : {q: row.name})
  }));
}
