import type {ApiEvent, Connection, ConnectionList, Datapath, EventKind, FlowStep, Group, HealthObservation, Node, ProbeResult, RuntimeMemory} from './model';
import {addU64, formatBytes, formatRate, parseU64, pctU64} from './u64';
import type {Capabilities, RuntimeOutbounds, TrafficHistory} from './model';

const navResources: Record<string, Array<keyof Capabilities['resources']>> = {
  connections: ['connections'], flows: ['flows'], dns: ['dns_query', 'dns_cache'], events: ['events'], policies: ['groups'], rules: ['routing_trace'], overview: ['runtime']
};
export function navAvailable(route: string, capabilities: Capabilities | undefined): boolean {
  return !capabilities || !navResources[route] || navResources[route].some(key => capabilities.resources[key].available !== false);
}
export const compatRoutes: Record<string, boolean> = {resources: true, config: true, validate: true};
export type ClientRow = {id: string; ip: string; active: number; download: bigint | null; outbounds: string};

export function clientRows(snapshot: ConnectionList | undefined): ClientRow[] {
  const rows = new Map<string, {id: string; ip: string; active: number; download: bigint | null; outbounds: Set<string>}>();
  for (const c of connectionRows(snapshot)) {
    if (!c.src) continue;
    const ip = c.src.startsWith('[') ? c.src.slice(0, c.src.indexOf(']') + 1) : c.src.split(':').length > 2 ? '[' + c.src + ']' : c.src.split(':')[0];
    let row = rows.get(ip);
    if (!row) { row = {id: ip, ip, active: 0, download: 0n, outbounds: new Set()}; rows.set(ip, row); }
    if (c.state === 'active') row.active++;
    row.download = addU64(row.download, c.download_bytes);
    if (c.outbound) row.outbounds.add(c.outbound);
  }
  return [...rows.values()].map(row => ({...row, outbounds: [...row.outbounds].join('、')}));
}

/** The latency column compares one fixed observation tuple; missing is unknown. */
export function preferredHealth(node: Node): HealthObservation | undefined {
  return node.health.find(h => h.transport === 'tcp' && h.purpose === 'data' && h.measurement === 'tcp_connect' && h.ip_version === 'ipv4' && h.warmth === 'warm');
}

export function outboundUsage(snapshot: RuntimeOutbounds | undefined) {
  const total = snapshot ? addU64(...snapshot.outbounds.map(row => row.download_bytes)) : null;
  const rows = (snapshot?.outbounds ?? []).map(row => ({name: row.name, bytes: parseU64(row.download_bytes), percent: pctU64(row.download_bytes, total)}));
  rows.sort((a, b) => a.bytes === b.bytes ? 0 : a.bytes === null ? 1 : b.bytes === null ? -1 : a.bytes > b.bytes ? -1 : 1);
  return {rows, total};
}

export function trafficSeries(history: TrafficHistory | undefined) {
  const rate = (value: string | null) => value === null ? null : Number(parseU64(value)) / 1000;
  const samples = history?.samples ?? [];
  return {timestamps: samples.map(s => Date.parse(s.sampled_at)), down: samples.map(s => rate(s.download_bytes_per_second)), up: samples.map(s => rate(s.upload_bytes_per_second)), connections: samples.map(s => s.connections)};
}

export function ipLiteral(text: string): string | undefined {
  const value = text.trim().replace(/^\[([^\]]+)\]$/, '$1');
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value) && value.split('.').every(n => Number(n) <= 255)) return value;
  if (!value.includes(':') || !/^[\da-f:.]+$/i.test(value)) return undefined;
  try { return new URL('http://[' + value + ']/').hostname.slice(1, -1); } catch { return undefined; }
}

export function sourceIp(src: string | undefined): string | undefined {
  if (!src) return undefined;
  return ipLiteral(src.startsWith('[') ? src.slice(1, src.indexOf(']')) : src.split(':').length === 2 ? src.split(':')[0] : src);
}

export function chainLabel(row: Pick<Connection, 'chain' | 'outbound'>): string {
  return row.outbound === 'direct' || row.outbound === 'block' ? row.outbound : row.chain.join(' → ') || '—';
}

export const connectionStates: Record<Connection['state'], string> = {observed: '觀測中', routing: '路由中', dialing: '撥號中', active: '進行中', closed: '已關閉', blocked: '已封鎖', failed: '失敗', unknown: '未知'};
const relativeTime = new Intl.RelativeTimeFormat('zh-Hant', {numeric: 'auto'});
export function relativeStart(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return '—';
  const seconds = Math.floor((Date.parse(startedAt) - now) / 1000);
  if (!Number.isFinite(seconds)) return '—';
  if (Math.abs(seconds) < 60) return relativeTime.format(seconds, 'second');
  if (Math.abs(seconds) < 3600) return relativeTime.format(Math.trunc(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return relativeTime.format(Math.trunc(seconds / 3600), 'hour');
  return relativeTime.format(Math.trunc(seconds / 86400), 'day');
}

export function connectionRows(snapshot: ConnectionList | undefined) {
  return snapshot ? [...snapshot.tcp.map(c => ({...c, network: 'tcp'})), ...snapshot.udp.map(c => ({...c, network: 'udp'}))] : [];
}

export function connectionDetails(c: Connection): Array<[string, string]> {
  return [['來源', c.src ?? '—'], ['目標位址', c.dst ?? '—'], ['域名', c.domain ?? '—'], ['入口', c.ingress ?? '—'], ['域名來源', c.domain_source ?? '—'], ['程序名稱', c.pname ?? '—'], ['觀測來源', c.observed_by], ['上傳', formatBytes(c.upload_bytes)], ['下載', formatBytes(c.download_bytes)], ['上傳速率', formatRate(c.upload_bytes_per_second)], ['下載速率', formatRate(c.download_bytes_per_second)], ['開始時間', c.started_at ?? '—']];
}

export function flowStepFields(step: FlowStep): Array<[string, string]> | null {
  const text = (value: unknown) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  switch (step.stage) {
    case 'input': return Object.entries(step.data.values).map(([key, value]) => [key, text(value)]);
    case 'route': return [['chain', step.data.chain], ['plane', step.data.plane], ['規則', step.data.rules.filter(rule => rule.result === 'matched').map(rule => rule.expression ?? rule.rule_id).join('；') || '—'], ['outbound', text(step.data.outbound)], ['must', text(step.data.must)]];
    case 'dial_mode': return [['撥號目標', step.data.configured + ' → ' + step.data.effective_target], ['verification', step.data.verification]];
    case 'dns': return [['name', step.data.name], ['source / cache', step.data.source + ' / ' + step.data.cache], ['upstream', text(step.data.upstream)], ['selected_ip', text(step.data.selected_ip)]];
    case 'outbound': return [['出站', text(step.data.routed_outbound) + ' → ' + text(step.data.effective_outbound)], ['選擇路徑', step.data.selection_path.map(p => p.group_id + ' → ' + text(p.member_name ?? p.member_id)).join('；') || '—'], ['leaf_node_id', text(step.data.leaf_node_id)], ['target', text(step.data.target)], ['status', step.data.status]];
    case 'connection': return [['狀態', connectionStates[step.data.state] ?? step.data.state], ['milestone', step.data.milestone], ['reason', step.data.reason]];
    case 'datapath': return [['plane', step.data.plane], ['action', step.data.action], ['reason', step.data.reason]];
    case 'reroute': return [['performed', text(step.data.performed)], ['reason', step.data.reason]];
    default: return null;
  }
}

export function groupConfigFields(group: Group): Array<[string, string]> {
  return Object.entries(group.config).filter(([, value]) => value !== null).map(([key, value]) => [key, String(value)]);
}

export function probeSummary(result: ProbeResult): string {
  const members = new Map<string, 'healthy' | 'unavailable' | 'unknown'>();
  for (const item of result.results) {
    const previous = members.get(item.member_id);
    if (previous !== 'unavailable' && (previous !== 'unknown' || item.state === 'unavailable')) members.set(item.member_id, item.state);
  }
  const states = [...members.values()];
  const unknown = states.filter(s => s === 'unknown').length;
  return states.filter(s => s === 'healthy').length + ' 個可用，' + states.filter(s => s === 'unavailable').length + ' 個無法使用' + (unknown ? '，' + unknown + ' 個狀態未知' : '') + '；' + (result.selection_changed.tcp || result.selection_changed.udp ? '選擇已變更' : '選擇未變更');
}

// Field lists take a label function so the pages can translate the keys; values stay contract vocabulary.
export type LabelFn = (key: string) => string;
export function datapathFields(datapath: Datapath, unknown: string, label: LabelFn = key => key): Array<[string, string]> {
  const ebpf = datapath.ebpf;
  const occupancy = ebpf?.maps?.conn_state;
  return [
    [label('kind'), datapath.kind], [label('state'), datapath.state], [label('visibility'), datapath.visibility],
    ...(ebpf ? [
      [label('backend'), ebpf.backend], [label('programs'), ebpf.programs], [label('hooks'), ebpf.hooks],
      [label('routing'), ebpf.routing.state + ' / ' + (ebpf.routing.generation_id ?? '—')],
      [label('health'), ebpf.health], [label('lastError'), ebpf.last_error ?? '—'],
      [label('maps'), ebpf.maps?.state ?? '—'],
      [label('connState'), occupancy?.occupancy_known && occupancy.occupancy !== null ? occupancy.occupancy + ' / ' + occupancy.capacity : unknown]
    ] as Array<[string, string]> : [])
  ];
}
export function memoryFields(memory: RuntimeMemory, label: LabelFn = key => key): Array<[string, string]> {
  const percent = pctU64(memory.cgroup?.current_bytes ?? null, memory.cgroup?.limit_bytes ?? null);
  return [
    [label('rss'), formatBytes(memory.process?.rss_bytes ?? null)],
    [label('cgroupCurrent'), formatBytes(memory.cgroup?.current_bytes ?? null)],
    [label('cgroupLimit'), formatBytes(memory.cgroup?.limit_bytes ?? null)],
    [label('cgroupPercent'), percent === null ? '—' : percent + '%'],
    [label('oomHigh'), memory.cgroup?.events?.high ?? '—'],
    [label('oom'), memory.cgroup?.events?.oom ?? '—'],
    [label('oomKill'), memory.cgroup?.events?.oom_kill ?? '—'],
    [label('ebpfBytes'), formatBytes(memory.kernel?.ebpf_bytes ?? null)]
  ];
}
/** Seconds (a UInt64 string) as days / hours / minutes; below a minute, seconds. */
export function formatDuration(seconds: string | null, units: {d: string; h: string; m: string; s: string}): string {
  if (seconds === null) return '—';
  const total = parseU64(seconds); if (total === null) return '—';
  const d = total / 86400n, h = (total % 86400n) / 3600n, m = (total % 3600n) / 60n;
  if (d > 0n) return `${d}${units.d} ${h}${units.h}`;
  if (h > 0n) return `${h}${units.h} ${m}${units.m}`;
  if (m > 0n) return `${m}${units.m}`;
  return `${total}${units.s}`;
}
export function localTime(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString() : iso;
}
export const eventKinds: EventKind[] = ['stream.ready', 'runtime.updated', 'flow.updated', 'flow.gap', 'operation.updated', 'generation.changed'];
export function eventSummary(event: ApiEvent): string {
  switch (event.event) {
    case 'stream.ready': return event.data.instance_id;
    case 'runtime.updated': return event.data.href;
    case 'flow.updated': return event.data.resource_id + ' / revision ' + event.data.revision;
    case 'operation.updated': return event.data.resource_id + ' / ' + event.data.status;
    case 'generation.changed': return event.data.previous_generation_id + ' → ' + event.data.generation_id;
    case 'flow.gap': return (event.data.resource_id ?? '—') + ' / ' + event.data.reason + ' / dropped_records ' + (event.data.dropped_records ?? '—');
  }
}
