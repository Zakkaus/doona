import type {ApiEvent, ConnectionList, Group, Node, Runtime, RuntimeMemory, RuntimeOutbounds} from '../../api/model';
import {eventSummary, healthMillis, lifecycleStates, lifecycleTone, localTime, outboundLabel, outboundUsage, preferredHealth} from '../../api/selectors';
import type {Translator as LabelFn} from '../../i18n';
import {formatBytes, formatRate, millis, pctU64} from '../../api/u64';
import {connectionRanking} from './ranking';
import {sameMode, type OutboundMode} from './mode';
import {menuViews} from '../policies/view';

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
    status: t(configAvailable ? 'act.modeNeedsWrite' : 'act.modeUnavailable'),
    modes: (['rule', 'direct', 'global'] as const).map(mode => [mode, t(modeLabels[mode])] as [string, string]),
    targets: groups.map(group => ({id: group.name, label: group.name}))
  };
}
export function noticeRows(events: ApiEvent[], t: LabelFn) {
  return events.map(event => {
    const summary = eventSummary(event, t);
    return {
      id: event.id,
      tone: event.event === 'flow.gap' ? ('warn' as const) : ('info' as const),
      kindText: t(event.event === 'flow.gap' ? 'ui.warning' : 'ui.notice'),
      summaryText: `${event.event} · ${t(summary.key, summary.params)}`
    };
  });
}
type NodeMenuItem = {id: string; label: string; description: string; className: string};
export type ActivityNodeMenu = {
  menu: {items: NodeMenuItem[]; sections: Array<{title: string; count: string; items: NodeMenuItem[]}>};
  big: boolean;
  id: string;
  name: string;
};

export function trafficState(series: {down: Array<number | null>; up: Array<number | null>}, available: boolean | undefined, loaded: boolean) {
  if (series.down.some(value => value !== null) || series.up.some(value => value !== null)) return 'ready';
  return available === false ? 'unavailable' : !loaded ? 'loading' : 'empty';
}

export function nodeView(nodes: Node[], chosen: string, t: LabelFn) {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
  const options = nodes.map(node => {
    const health = preferredHealth(node);
    return {
      id: node.id,
      name: node.name,
      label: counts.get(node.name)! > 1 ? `${node.name} · ${node.subscription_tag ?? node.provider_id ?? node.id} · ${node.id}` : node.name,
      tcp: healthMillis(health),
      alive: health?.state === 'unavailable' ? false : health?.state === 'healthy' ? true : undefined,
      unavailable: health?.state === 'unavailable'
    };
  });
  const node =
    options.find(n => n.id === chosen) ?? options.find(n => n.tcp !== undefined) ?? options.find(n => n.name !== 'direct' && n.name !== 'block') ?? options[0];
  return {
    menu: menuViews(options, t),
    big: options.length > 12,
    id: node?.id ?? '',
    name: node?.name ?? '',
    latency: node?.alive && node.tcp !== undefined ? t('ui.latency', {n: millis(node.tcp)}) : '—',
    tone: node?.alive ? ('ok' as const) : node?.unavailable ? ('err' as const) : ('muted' as const),
    status: t(node?.alive ? 'act.good' : node?.unavailable ? 'act.timeout' : 'act.unknown')
  };
}
export function activityView(runtime: Runtime | undefined, memory: RuntimeMemory | undefined, t: LabelFn) {
  const percent = pctU64(memory?.cgroup?.current_bytes ?? null, memory?.cgroup?.limit_bytes ?? null);
  return {
    status: {
      tone: lifecycleTone(runtime?.lifecycle.state) as 'ok' | 'err' | 'warn',
      text: runtime ? t(lifecycleStates[runtime.lifecycle.state]) : t('act.loading')
    },
    download: formatRate(runtime?.traffic.rates?.download_bytes_per_second ?? null),
    upload: formatRate(runtime?.traffic.rates?.upload_bytes_per_second ?? null),
    connections: runtime?.traffic.connections.total ?? '—',
    rss: formatBytes(memory?.process?.rss_bytes ?? null),
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
    total: formatBytes(usage.total),
    rows: usage.rows.map((row, i) => ({
      name: outboundLabel(row.name, t),
      value: row.percent === null ? null : Math.round(row.percent),
      text: formatBytes(row.bytes),
      color: row.kind === 'builtin' && row.name === 'block' ? colors.love : colors.cat[i % colors.cat.length]
    }))
  };
}

export function activityRanking(connections: ConnectionList | undefined, by: string, colors: {cat: string[]}, t: LabelFn) {
  return connectionRanking(connections, by).map((row, i) => ({
    name: row.name,
    value: row.percent === null ? formatBytes(row.download) : t('ui.share', {bytes: formatBytes(row.download), percent: row.percent}),
    pct: row.percent ?? 0,
    color: colors.cat[i % colors.cat.length]
  }));
}
