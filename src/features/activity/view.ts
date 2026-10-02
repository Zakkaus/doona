import type {ApiEvent, ConnectionList, Datapath, GroupSummary, Node, Runtime, RuntimeOutbounds} from '../../api/model';
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
  shortId
} from '../../api/selectors';
import {localTime, formatBytes, formatRate, formatLatency, formatCpu} from '../../i18n/format';
import {formatNumber, type Key, type Translator as LabelFn} from '../../i18n';
import {connectionRanking} from '../shared/ranking';
import {engineStatus} from '../shared/engineStatus';
import {href} from '../../shell/route';

export {modeView, modeReasons} from '../shared/modeView';
export type NoticeRow = {id: string; tone: 'err' | 'warn' | 'info'; kindText: string; summaryText: string; action?: {label: string; href: string}};
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

export {interestingNotice} from '../../api/selectors';

// The home card holds this many rows; the rest is one click away on the events page.
const NOTICE_ROWS = 8;
// A failed operation is an error and a recorder gap a warning; every other event is a notice.
const noticeTone = (event: ApiEvent): NoticeRow['tone'] =>
  event.event === 'operation.updated' && event.data.status === 'failed' ? 'err' : event.event === 'flow.gap' ? 'warn' : 'info';
// A run of identical notices (same kind, same resource, same reason) folds into one row with a count, so a
// backend dropping records at pace does not push everything else off the card. Two notices that differ in
// any of those never fold: a failure must not disappear behind a neighbouring success.
export function noticeRows(events: ApiEvent[], t: LabelFn) {
  const rows: Array<{id: string; tone: NoticeRow['tone']; kindText: string; summaryText: string; key: string; count: number}> = [];
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
    const tone = noticeTone(event);
    rows.push({
      id: event.id,
      tone,
      kindText: t(tone === 'err' ? 'ui.error' : tone === 'warn' ? 'ui.warning' : 'ui.notice'),
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

export const outboundColor = (row: {name: string; kind: string}, index: number, colors: {cat: string[]; love: string}) =>
  row.kind === 'builtin' && row.name === 'block' ? colors.love : colors.cat[index % colors.cat.length];

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
      color: outboundColor(row, i, colors)
    }))
  };
}

export function activityRanking(connections: ConnectionList | undefined, by: string, colors: {cat: string[]}, locale: string, t: LabelFn, limit = 5) {
  return connectionRanking(connections, by, limit).map((row, i) => ({
    name: row.name,
    value: row.percent === null ? formatBytes(row.download, locale) : t('ui.share', {bytes: formatBytes(row.download, locale), percent: row.percent}),
    pct: row.percent ?? 0,
    color: colors.cat[i % colors.cat.length],
    // The connection list filtered to the device, or searched for the domain or address.
    href: href('connections', by === 'dev' ? {src: row.name} : {q: row.name})
  }));
}
