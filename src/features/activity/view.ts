import type {ApiEvent, ConnectionList, Group, Node, Runtime, RuntimeMemory, RuntimeOutbounds} from '../../api/model';
import {
  eventKindLabels,
  eventSummary,
  healthMillis,
  lifecycleStates,
  lifecycleTone,
  outboundLabel,
  outboundUsage,
  preferredHealth,
  routineGap,
  shortId
} from '../../api/selectors';
import {localTime, formatBytes, formatRate, formatLatency} from '../../i18n/format';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {pctU64} from '../../api/u64';
import {connectionRanking} from './ranking';
import {sameMode, type OutboundMode} from './mode';

export const modeLabels = {rule: 'mode.rule', direct: 'mode.direct', global: 'mode.global'} as const;
export function modeView(
  current: OutboundMode,
  staged: OutboundMode | null,
  groups: Array<Pick<Group, 'name'>>,
  writable: boolean,
  configAvailable: boolean,
  t: LabelFn
) {
  const shown = staged ?? current;
  const target = shown.mode === 'global' ? shown.target : ((current.mode === 'global' ? current.target : groups[0]?.name) ?? '');
  return {
    mode: shown.mode,
    target,
    targetText: target || '—',
    writable,
    dirty: staged !== null && !sameMode(staged, current),
    // Global mode needs a group to send everything to; without one there is nothing valid to write.
    incomplete: shown.mode === 'global' && !target,
    status: t(configAvailable ? 'act.modeNeedsWrite' : 'act.modeUnavailable'),
    modes: (['rule', 'direct', 'global'] as const).map(mode => [mode, t(modeLabels[mode])] as [string, string]),
    targets: groups.map(group => ({id: group.name, label: group.name}))
  };
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
      summaryText: t('ui.valuePair', {label: t(eventKindLabels[event.event]), value: t(summary.key, params)}),
      key,
      count: 1
    });
  }
  return rows.map(({key: _key, count, summaryText, ...row}) => ({
    ...row,
    summaryText: count > 1 ? t('ui.aside', {text: summaryText, note: t('act.noticeRepeat', {n: count})}) : summaryText
  }));
}
export type ActivityNodeMenu = {
  options: NodeOption[];
  big: boolean;
  id: string;
  name: string;
};

export function trafficState(series: {down: Array<number | null>; up: Array<number | null>}, available: boolean | undefined, loaded: boolean, live = false) {
  if (series.down.some(value => value !== null) || series.up.some(value => value !== null)) return 'ready';
  if (available === false) return live ? 'loading' : 'unavailable';
  return !loaded ? 'loading' : 'empty';
}

type NodeOption = {id: string; name: string; label: string; tcp?: number; alive?: boolean; unavailable: boolean; healthError?: string};
export function nodeView(nodes: Node[], chosen: string, t: LabelFn) {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
  const options = nodes.map((node): NodeOption => {
    const health = preferredHealth(node);
    return {
      id: node.id,
      name: node.name,
      label:
        counts.get(node.name)! > 1
          ? t('ui.aside', {text: node.name, note: [node.subscription_tag ?? node.provider_id ?? node.id, node.id].join(t('ui.separator'))})
          : node.name,
      tcp: healthMillis(health),
      alive: health?.state === 'unavailable' ? false : health?.state === 'healthy' ? true : undefined,
      unavailable: health?.state === 'unavailable',
      healthError: health?.error ?? undefined
    };
  });
  const node =
    options.find(n => n.id === chosen) ?? options.find(n => n.tcp !== undefined) ?? options.find(n => n.name !== 'direct' && n.name !== 'block') ?? options[0];
  return {
    options,
    big: options.length > 12,
    id: node?.id ?? '',
    name: node?.name ?? '',
    latency: node?.alive && node.tcp !== undefined ? formatLatency(node.tcp, t) : '—',
    tone: node?.alive ? ('ok' as const) : node?.unavailable ? ('err' as const) : ('muted' as const),
    status: t(node?.alive ? 'act.good' : node?.unavailable ? 'act.unavailable' : 'act.unknown'),
    healthError: node?.healthError
  };
}
export function activityView(runtime: Runtime | undefined, memory: RuntimeMemory | undefined, t: LabelFn, runtimeAvailable?: boolean, locale = 'en') {
  const percent = pctU64(memory?.cgroup?.current_bytes ?? null, memory?.cgroup?.limit_bytes ?? null);
  return {
    status: {
      tone: lifecycleTone(runtime?.lifecycle.state) as 'ok' | 'err' | 'warn',
      text: runtime ? t(lifecycleStates[runtime.lifecycle.state]) : t(runtimeAvailable === false ? 'act.modeUnavailable' : 'ui.loading')
    },
    download: formatRate(runtime?.traffic.rates?.download_bytes_per_second ?? null, locale),
    upload: formatRate(runtime?.traffic.rates?.upload_bytes_per_second ?? null, locale),
    connections: runtime?.traffic.connections.total == null ? '—' : formatNumber(runtime.traffic.connections.total, locale),
    rss: formatBytes(memory?.process?.rss_bytes ?? null, locale),
    memoryBadge:
      percent === null
        ? null
        : {
            tone: percent > 90 ? ('err' as const) : percent > 75 ? ('warn' as const) : ('ok' as const),
            text: t(percent > 90 ? 'act.memoryNearLimit' : percent > 75 ? 'act.memoryHigh' : 'act.memoryOk')
          }
  };
}

export function activityOutbounds(outbounds: RuntimeOutbounds | undefined, locale: string, colors: {cat: string[]; love: string}, t: LabelFn) {
  const usage = outboundUsage(outbounds);
  return {
    since: outbounds ? t('act.since', {t: localTime(outbounds.counter_since, locale)}) : '',
    total: formatBytes(usage.total, locale),
    rows: usage.rows.map((row, i) => ({
      name: outboundLabel(row.name, t),
      value: row.percent === null ? null : Math.round(row.percent),
      text: formatBytes(row.bytes, locale),
      color: row.kind === 'builtin' && row.name === 'block' ? colors.love : colors.cat[i % colors.cat.length]
    }))
  };
}

export function activityRanking(connections: ConnectionList | undefined, by: string, colors: {cat: string[]}, locale: string, t: LabelFn) {
  return connectionRanking(connections, by).map((row, i) => ({
    name: row.name,
    value: row.percent === null ? formatBytes(row.download, locale) : t('ui.share', {bytes: formatBytes(row.download, locale), percent: row.percent}),
    pct: row.percent ?? 0,
    color: colors.cat[i % colors.cat.length]
  }));
}
