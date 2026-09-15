import type {Key} from '../i18n/messages';
import type {
  ApiEvent,
  Connection,
  ConnectionList,
  Datapath,
  EventKind,
  FlowStep,
  Group,
  HealthObservation,
  Node,
  ProbeResult,
  Runtime,
  RuntimeMemory
} from './model';
import {addU64, formatBytes, formatRate, parseU64, pctU64} from './u64';
import type {RuntimeOutbounds, TrafficHistory} from './model';

export type ClientRow = {id: string; ip: string; active: number; download: bigint | null; outbounds: string};

export function clientRows(snapshot: ConnectionList | undefined): ClientRow[] {
  const rows = new Map<string, {id: string; ip: string; active: number; download: bigint | null; outbounds: Set<string>}>();
  for (const c of connectionRows(snapshot)) {
    if (!c.src) continue;
    const ip = c.src.startsWith('[') ? c.src.slice(0, c.src.indexOf(']') + 1) : c.src.split(':').length > 2 ? '[' + c.src + ']' : c.src.split(':')[0];
    let row = rows.get(ip);
    if (!row) {
      row = {id: ip, ip, active: 0, download: 0n, outbounds: new Set()};
      rows.set(ip, row);
    }
    if (c.state === 'active') row.active++;
    row.download = addU64(row.download, c.download_bytes);
    if (c.outbound) row.outbounds.add(c.outbound);
  }
  return [...rows.values()].map(row => ({...row, outbounds: [...row.outbounds].join('、')}));
}

/** The latency column compares one fixed observation tuple; missing is unknown. */
export function preferredHealth(node: Node): HealthObservation | undefined {
  return node.health.find(
    h => h.transport === 'tcp' && h.purpose === 'data' && h.measurement === 'tcp_connect' && h.ip_version === 'ipv4' && h.warmth === 'warm'
  );
}

export function outboundUsage(snapshot: RuntimeOutbounds | undefined) {
  const total = snapshot ? addU64(...snapshot.outbounds.map(row => row.download_bytes)) : null;
  const rows = (snapshot?.outbounds ?? []).map(row => ({name: row.name, bytes: parseU64(row.download_bytes), percent: pctU64(row.download_bytes, total)}));
  rows.sort((a, b) => (a.bytes === b.bytes ? 0 : a.bytes === null ? 1 : b.bytes === null ? -1 : a.bytes > b.bytes ? -1 : 1));
  return {rows, total};
}

export function trafficSeries(history: TrafficHistory | undefined) {
  const rate = (value: string | null) => (value === null ? null : Number(parseU64(value)) / 1000);
  const samples = history?.samples ?? [];
  return {
    timestamps: samples.map(s => Date.parse(s.sampled_at)),
    down: samples.map(s => rate(s.download_bytes_per_second)),
    up: samples.map(s => rate(s.upload_bytes_per_second)),
    connections: samples.map(s => s.connections)
  };
}

export function ipLiteral(text: string): string | undefined {
  const value = text.trim().replace(/^\[([^\]]+)\]$/, '$1');
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value) && value.split('.').every(n => Number(n) <= 255)) return value;
  if (!value.includes(':') || !/^[\da-f:.]+$/i.test(value)) return undefined;
  try {
    return new URL('http://[' + value + ']/').hostname.slice(1, -1);
  } catch {
    return undefined;
  }
}

export function sourceIp(src: string | undefined): string | undefined {
  if (!src) return undefined;
  return ipLiteral(src.startsWith('[') ? src.slice(1, src.indexOf(']')) : src.split(':').length === 2 ? src.split(':')[0] : src);
}

export function chainLabel(row: Pick<Connection, 'chain' | 'outbound'>): string {
  return row.outbound === 'direct' || row.outbound === 'block' ? row.outbound : row.chain.join(' → ') || '—';
}

export const lifecycleStates: Record<Runtime['lifecycle']['state'], Key> = {
  starting: 'lifecycle.starting',
  running: 'lifecycle.running',
  reloading: 'lifecycle.reloading',
  suspended: 'lifecycle.suspended',
  draining: 'lifecycle.draining',
  degraded: 'lifecycle.degraded',
  failed: 'lifecycle.failed'
};
export const connectionStates: Record<Connection['state'], Key> = {
  observed: 'conn.state.observed',
  routing: 'conn.state.routing',
  dialing: 'conn.state.dialing',
  active: 'conn.state.active',
  closed: 'conn.state.closed',
  blocked: 'conn.state.blocked',
  failed: 'conn.state.failed',
  unknown: 'conn.state.unknown'
};
const relativeTimes = new Map<string, Intl.RelativeTimeFormat>();
export function relativeStart(startedAt: string | null, locale: string, now = Date.now()): string {
  if (!startedAt) return '—';
  const seconds = Math.floor((Date.parse(startedAt) - now) / 1000);
  if (!Number.isFinite(seconds)) return '—';
  let formatter = relativeTimes.get(locale);
  if (!formatter) relativeTimes.set(locale, (formatter = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'})));
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  if (Math.abs(seconds) < 3600) return formatter.format(Math.trunc(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return formatter.format(Math.trunc(seconds / 3600), 'hour');
  return formatter.format(Math.trunc(seconds / 86400), 'day');
}

export function connectionRows(snapshot: ConnectionList | undefined) {
  return snapshot ? [...snapshot.tcp.map(c => ({...c, network: 'tcp'})), ...snapshot.udp.map(c => ({...c, network: 'udp'}))] : [];
}

export function connectionDetails(c: Connection, locale: string): Array<[Key, string]> {
  return [
    ['ui.source', c.src ?? '—'],
    ['conn.f.dst', c.dst ?? '—'],
    ['ui.domain', c.domain ?? '—'],
    ['conn.f.ingress', c.ingress ?? '—'],
    ['conn.f.domainSource', c.domain_source ?? '—'],
    ['ui.process', c.pname ?? '—'],
    ['conn.f.observedBy', c.observed_by],
    ['ui.upload', formatBytes(c.upload_bytes)],
    ['ui.download', formatBytes(c.download_bytes)],
    ['conn.f.uploadRate', formatRate(c.upload_bytes_per_second)],
    ['conn.f.downloadRate', formatRate(c.download_bytes_per_second)],
    ['conn.f.started', localTime(c.started_at, locale)]
  ];
}

export type MessageRef = {key: Key; params?: Record<string, string | number>};
export function flowStepFields(step: FlowStep): Array<[Key | MessageRef, string | MessageRef]> | null {
  const text = (value: unknown) => (value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  switch (step.stage) {
    case 'input':
      return Object.entries(step.data.values).map(([key, value]) => [{key: 'flow.f.input', params: {name: key}}, text(value)]);
    case 'route':
      return [
        ['flow.f.chain', step.data.chain],
        ['flow.f.plane', step.data.plane],
        [
          'ui.rule',
          step.data.rules
            .filter(rule => rule.result === 'matched')
            .map(rule => rule.expression ?? rule.rule_id)
            .join('；') || '—'
        ],
        ['ui.outbound', text(step.data.outbound)],
        ['flow.f.must', text(step.data.must)]
      ];
    case 'dial_mode':
      return [
        ['flow.f.dialTarget', step.data.configured + ' → ' + step.data.effective_target],
        ['flow.f.verification', step.data.verification]
      ];
    case 'dns':
      return [
        ['ui.name', step.data.name],
        ['flow.f.sourceCache', step.data.source + ' / ' + step.data.cache],
        ['ui.upstream', text(step.data.upstream)],
        ['flow.f.selectedIp', text(step.data.selected_ip)]
      ];
    case 'outbound':
      return [
        ['ui.outbound', text(step.data.routed_outbound) + ' → ' + text(step.data.effective_outbound)],
        ['flow.f.selectionPath', step.data.selection_path.map(p => p.group_id + ' → ' + text(p.member_name ?? p.member_id)).join(' / ') || '—'],
        ['flow.f.leafNode', text(step.data.leaf_node_id)],
        ['ui.target', text(step.data.target)],
        ['ui.state', step.data.status]
      ];
    case 'connection':
      return [
        ['ui.state', {key: connectionStates[step.data.state]}],
        ['flow.f.milestone', step.data.milestone],
        ['flow.f.reason', step.data.reason]
      ];
    case 'datapath':
      return [
        ['flow.f.plane', step.data.plane],
        ['flow.f.action', step.data.action],
        ['flow.f.reason', step.data.reason]
      ];
    case 'reroute':
      return [
        ['flow.f.performed', text(step.data.performed)],
        ['flow.f.reason', step.data.reason]
      ];
    default:
      return null;
  }
}

export function groupConfigFields(group: Group): Array<[string, string]> {
  return Object.entries(group.config)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, String(value)]);
}

export function probeSummary(result: ProbeResult): MessageRef {
  const members = new Map<string, 'healthy' | 'unavailable' | 'unknown'>();
  for (const item of result.results) {
    const previous = members.get(item.member_id);
    if (previous !== 'unavailable' && (previous !== 'unknown' || item.state === 'unavailable')) members.set(item.member_id, item.state);
  }
  const states = [...members.values()];
  return {
    key: result.selection_changed.tcp || result.selection_changed.udp ? 'policy.probeChanged' : 'policy.probeUnchanged',
    params: {
      healthy: states.filter(s => s === 'healthy').length,
      unavailable: states.filter(s => s === 'unavailable').length,
      unknown: states.filter(s => s === 'unknown').length
    }
  };
}

// Field lists take a label function so the pages can translate the keys; values stay contract vocabulary.
export type LabelFn = (key: Key) => string;
export function datapathFields(datapath: Datapath, unknown: string, label: LabelFn): Array<[string, string]> {
  const ebpf = datapath.ebpf;
  const occupancy = ebpf?.maps?.conn_state;
  return [
    [label('ov.f.kind'), datapath.kind],
    [label('ov.f.state'), datapath.state],
    [label('ov.f.visibility'), datapath.visibility],
    ...(ebpf
      ? ([
          [label('ov.f.backend'), ebpf.backend],
          [label('ov.f.programs'), ebpf.programs],
          [label('ov.f.hooks'), ebpf.hooks],
          [label('ov.f.routing'), ebpf.routing.state + ' / ' + (ebpf.routing.generation_id ?? '—')],
          [label('ov.f.health'), ebpf.health],
          [label('ov.f.lastError'), ebpf.last_error ?? '—'],
          [label('ov.f.maps'), ebpf.maps?.state ?? '—'],
          [label('ov.f.connState'), occupancy?.occupancy_known && occupancy.occupancy !== null ? occupancy.occupancy + ' / ' + occupancy.capacity : unknown]
        ] as Array<[string, string]>)
      : [])
  ];
}
export function memoryFields(memory: RuntimeMemory, label: LabelFn): Array<[string, string]> {
  const percent = pctU64(memory.cgroup?.current_bytes ?? null, memory.cgroup?.limit_bytes ?? null);
  return [
    [label('ov.f.rss'), formatBytes(memory.process?.rss_bytes ?? null)],
    [label('ov.f.cgroupCurrent'), formatBytes(memory.cgroup?.current_bytes ?? null)],
    [label('ov.f.cgroupLimit'), formatBytes(memory.cgroup?.limit_bytes ?? null)],
    [label('ov.f.cgroupPercent'), percent === null ? '—' : percent + '%'],
    [label('ov.f.oomHigh'), memory.cgroup?.events?.high ?? '—'],
    [label('ov.f.oom'), memory.cgroup?.events?.oom ?? '—'],
    [label('ov.f.oomKill'), memory.cgroup?.events?.oom_kill ?? '—'],
    [label('ov.f.ebpfBytes'), formatBytes(memory.kernel?.ebpf_bytes ?? null)]
  ];
}
/** Seconds (a UInt64 string) as days / hours / minutes; below a minute, seconds. */
const durationUnits = new Map<string, Intl.NumberFormat>();
export function formatDuration(seconds: string | null, locale: string): string {
  if (seconds === null) return '—';
  const total = parseU64(seconds);
  if (total === null) return '—';
  const d = total / 86400n,
    h = (total % 86400n) / 3600n,
    m = (total % 3600n) / 60n;
  const unit = (value: bigint, name: string) => {
    const key = locale + '/' + name;
    let formatter = durationUnits.get(key);
    if (!formatter) durationUnits.set(key, (formatter = new Intl.NumberFormat(locale, {style: 'unit', unit: name, unitDisplay: 'short'})));
    return formatter.format(value);
  };
  if (d > 0n) return `${unit(d, 'day')} ${unit(h, 'hour')}`;
  if (h > 0n) return `${unit(h, 'hour')} ${unit(m, 'minute')}`;
  if (m > 0n) return unit(m, 'minute');
  return unit(total, 'second');
}
const localTimes = new Map<string, Intl.DateTimeFormat>();
export function localTime(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  let formatter = localTimes.get(locale);
  if (!formatter) localTimes.set(locale, (formatter = new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeStyle: 'medium'})));
  return formatter.format(t);
}
export const eventKinds: EventKind[] = ['stream.ready', 'runtime.updated', 'flow.updated', 'flow.gap', 'operation.updated', 'generation.changed'];
export function eventSummary(event: ApiEvent): MessageRef {
  switch (event.event) {
    case 'stream.ready':
      return {key: 'event.resource', params: {resource: event.data.instance_id}};
    case 'runtime.updated':
      return {key: 'event.resource', params: {resource: event.data.href}};
    case 'flow.updated':
      return {key: 'event.flow', params: {id: event.data.resource_id, revision: event.data.revision}};
    case 'operation.updated':
      return {key: 'event.operation', params: {id: event.data.resource_id, status: event.data.status}};
    case 'generation.changed':
      return {key: 'event.generation', params: {previous: event.data.previous_generation_id, current: event.data.generation_id}};
    case 'flow.gap':
      return {key: 'event.gap', params: {id: event.data.resource_id ?? '—', reason: event.data.reason, n: event.data.dropped_records ?? '—'}};
  }
}
