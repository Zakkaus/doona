import type {Key} from '../i18n';
import {formatNumber, LOCALE, readLang} from '../i18n';
import type {ApiEvent, Connection, ConnectionList, EventKind, Group, GroupSummary, HealthObservation, LogLevel, Node, Runtime, RuntimeOutbounds} from './model';
import {addU64, parseU64, pctU64} from './u64';

// Backends offer different TCP data probes: rank by warmth, measurement cost, then IPv4; unknown values sort last.
const warmthRank: Record<string, number> = {warm: 0, unknown: 1, mixed: 2, cold: 3};
const measurementRank: Record<string, number> = {
  tcp_connect: 0,
  http_headers: 1,
  http_round_trip: 2,
  quic_handshake: 3,
  mixed: 4,
  unknown: 5,
  dns_round_trip: 6
};
export function preferredObservation<T extends HealthObservation>(health: T[]): T | undefined {
  const rank = (h: HealthObservation) => (warmthRank[h.warmth] ?? 1) * 100 + (measurementRank[h.measurement] ?? 5) * 10 + (h.ip_version === 'ipv4' ? 0 : 1);
  return health.filter(h => h.transport === 'tcp' && h.purpose === 'data').sort((a, b) => rank(a) - rank(b))[0];
}
export const preferredHealth = (node: Node) => preferredObservation(node.health);
export const healthMillis = (health: Pick<HealthObservation, 'state' | 'latency_ms'> | undefined) =>
  health?.state === 'healthy' && health.latency_ms != null ? health.latency_ms : undefined;
export const compareLatency = (a: number | undefined, b: number | undefined) => (a ?? Infinity) - (b ?? Infinity) || 0;

export function outboundUsage(snapshot: RuntimeOutbounds | undefined) {
  const total = snapshot ? addU64(...snapshot.outbounds.map(row => row.download_bytes)) : null;
  const rows = (snapshot?.outbounds ?? []).map(row => ({
    name: row.name,
    kind: row.kind,
    bytes: parseU64(row.download_bytes),
    percent: pctU64(row.download_bytes, total)
  }));
  rows.sort((a, b) => (a.bytes === b.bytes ? 0 : a.bytes === null ? 1 : b.bytes === null ? -1 : a.bytes > b.bytes ? -1 : 1));
  return {rows, total};
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

export function outboundLabel(name: string | null, label: LabelFn): string {
  return name === 'direct' ? label('ui.direct') : name === 'block' ? label('ui.block') : name === null || name === 'unknown' ? label('ui.unknown') : name;
}
// A chain carries group ids followed by the leaf node id; `names` turns them into what the config calls them.
export type OutboundNames = ReadonlyMap<string, string>;
export const chainNames = (chain: string[], names?: OutboundNames) => chain.map(id => names?.get(id) ?? id);
export function chainLabel(row: Pick<Connection, 'chain' | 'outbound'>, label?: LabelFn, names?: OutboundNames): string {
  if (row.outbound === 'direct' || row.outbound === 'block') return label ? outboundLabel(row.outbound, label) : row.outbound;
  return chainNames(row.chain, names).join(' → ') || '—';
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
export const lifecycleTone = (state: Runtime['lifecycle']['state'] | undefined) => (state === 'running' ? 'ok' : state === 'failed' ? 'err' : 'warn');
// Nothing closed is a failure; some skipped (already gone or not closable) is worth a look.
export const closedAllTone = (tally: {closed: number; skipped: number}) => (!tally.closed ? 'negative' : tally.skipped ? 'info' : 'positive');
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

export function connectionRows(snapshot: ConnectionList | undefined) {
  return snapshot ? [...snapshot.tcp.map(c => ({...c, network: 'tcp'})), ...snapshot.udp.map(c => ({...c, network: 'udp'}))] : [];
}

export type MessageRef = {key: Key; params?: Record<string, string | number>};

export type LabelFn = (key: Key) => string;
export const eventKinds: EventKind[] = ['stream.ready', 'runtime.updated', 'flow.updated', 'flow.gap', 'operation.updated', 'generation.changed'];
export const eventKindLabels: Record<EventKind, Key> = {
  'stream.ready': 'event.k.streamReady',
  'runtime.updated': 'event.k.runtimeUpdated',
  'flow.updated': 'event.k.flowUpdated',
  'flow.gap': 'event.k.flowGap',
  'operation.updated': 'event.k.operationUpdated',
  'generation.changed': 'event.k.generationChanged'
};
// Suppress routine eviction and sampling gaps; report lost history or recording-scope changes.
export function routineGap(event: ApiEvent): boolean {
  if (event.event !== 'flow.gap') return false;
  const {reason} = event.data;
  return reason === 'evicted' || reason === 'sampled';
}
const gapReasons: Record<string, Key> = {
  buffer_overflow: 'event.gap.overflow',
  sampled: 'event.gap.sampled',
  evicted: 'event.gap.evicted',
  recording_changed: 'event.gap.recording'
};
// A safe integer goes to the translator, which groups it in the caller's language; a larger UInt64 is grouped
// here as a bigint, since a JS number would round it.
function droppedCount(value: string | null): string | number {
  const count = parseU64(value);
  if (count === null) return value ?? '—';
  return count <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(count) : formatNumber(count, LOCALE[readLang()]);
}
export function eventSummary(event: ApiEvent, t?: (key: Key) => string): MessageRef {
  switch (event.event) {
    case 'stream.ready':
      return {key: 'event.resource', params: {resource: event.data.instance_id}};
    case 'runtime.updated':
      return {key: 'event.resource', params: {resource: event.data.href}};
    case 'flow.updated':
      return {key: 'event.flow', params: {id: event.data.resource_id, revision: String(event.data.revision)}};
    case 'operation.updated': {
      const status = event.data.status;
      const label = status === 'running' || status === 'succeeded' || status === 'failed' ? (`ov.${status}` as Key) : null;
      return {key: 'event.operation', params: {id: event.data.resource_id, status: t && label ? t(label) : status}};
    }
    case 'generation.changed':
      return {key: 'event.generation', params: {previous: event.data.previous_generation_id, current: event.data.generation_id}};
    case 'flow.gap':
      return {
        key: 'event.gap',
        params: {
          id: event.data.resource_id ?? '—',
          reason: t && gapReasons[event.data.reason] ? t(gapReasons[event.data.reason]) : event.data.reason,
          n: droppedCount(event.data.dropped_records)
        }
      };
  }
}

export const shortId = (id: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : id);

export function resolveSelectedLeaf(
  outbound: string,
  network: 'tcp' | 'udp',
  groupsByName: ReadonlyMap<string, GroupSummary>,
  groupsById: ReadonlyMap<string, GroupSummary>,
  nodesById: ReadonlyMap<string, Node>
): {groups: GroupSummary[]; member: string | null; node: Node | null} {
  const groups: GroupSummary[] = [];
  const visited = new Set<string>();
  let group = groupsByName.get(outbound);
  while (group && !visited.has(group.id)) {
    visited.add(group.id);
    groups.push(group);
    const member = network === 'udp' ? group.selection.udp_member_id : group.selection.tcp_member_id;
    if (!member) return {groups, member: null, node: null};
    const next = groupsById.get(member);
    if (!next) return {groups, member, node: nodesById.get(member) ?? null};
    group = next;
  }
  return {groups, member: null, node: null};
}

// Labels that more than one page shows.
export const policyKindLabels: Record<Group['policy']['kind'], Key> = {
  selector: 'policy.kind.selector',
  urltest: 'policy.kind.urltest',
  loadbalance: 'policy.kind.loadbalance',
  fallback: 'policy.kind.fallback',
  random: 'policy.kind.random',
  score: 'policy.kind.score'
};
export const logLevelLabels: Record<LogLevel, Key> = {
  trace: 'log.level.trace',
  debug: 'log.level.debug',
  info: 'log.level.info',
  warn: 'log.level.warn',
  error: 'log.level.error'
};
export const operationLabels = {reload: 'ov.reload', suspend: 'ov.suspend', resume: 'ov.resume'} as const;
