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

/** The latency column compares one observation tuple: warm TCP data probes, IPv4 first and IPv6 when that is all a node has. */
// The one TCP data observation a node's latency column shows. Backends differ in what they measure (honk's
// periodic probe reports HTTP headers on an unknown-warmth session; a warm TCP connect is the cheapest), so
// the pick is a ranking rather than a fixed tuple: warmth, then measurement cost, then IPv4 before IPv6.
// Vocabulary a newer backend adds sorts with the unknown entries rather than falling out of the order.
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

// Group policy kinds in the user's language.
export const policyKindLabels: Record<Group['policy']['kind'], Key> = {
  selector: 'policy.kind.selector',
  urltest: 'policy.kind.urltest',
  loadbalance: 'policy.kind.loadbalance',
  fallback: 'policy.kind.fallback',
  random: 'policy.kind.random',
  score: 'policy.kind.score'
};
// Built-in outbounds read in the user's language; group and node names stay as configured.
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

export function connectionDetails(c: Connection, locale: string): Array<[Key, string | MessageRef]> {
  return [
    ['ui.source', c.src ?? '—'],
    ['conn.f.dst', c.dst ?? '—'],
    ['ui.domain', c.domain ?? '—'],
    ['conn.f.ingress', word(c.ingress)],
    ['conn.f.domainSource', word(c.domain_source)],
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
const flowWords: Record<string, Key> = {
  kernel: 'flow.v.kernel',
  userspace: 'flow.v.userspace',
  matched: 'flow.v.matched',
  other_family_trusted: 'flow.v.otherFamilyTrusted',
  failed: 'flow.v.failed',
  not_required: 'flow.v.notRequired',
  unavailable: 'flow.v.unavailable',
  pass: 'flow.v.pass',
  redirect: 'flow.v.redirect',
  hold: 'flow.v.hold',
  arm_direct: 'flow.v.armDirect',
  activate_direct: 'flow.v.activateDirect',
  activate_proxy: 'flow.v.activateProxy',
  drop: 'flow.v.drop',
  started: 'flow.v.started',
  succeeded: 'flow.v.succeeded',
  cancelled: 'flow.v.cancelled',
  transport_ready: 'flow.v.transportReady',
  target_request_sent: 'flow.v.targetRequestSent',
  target_confirmed: 'flow.v.targetConfirmed',
  first_reply: 'flow.v.firstReply',
  terminal: 'flow.v.terminal',
  unknown: 'ui.unknown',
  route_selected: 'flow.v.routeSelected',
  no_new_routing_input: 'flow.v.noNewRoutingInput',
  reply_received: 'flow.v.replyReceived',
  hit: 'flow.v.hit',
  miss: 'flow.v.miss',
  stale: 'flow.v.stale',
  bypass: 'flow.v.bypass',
  hosts: 'flow.v.hosts',
  coalesced: 'flow.v.coalesced',
  cache: 'flow.v.cache',
  upstream: 'ui.upstream',
  lan: 'flow.v.lan',
  wan: 'flow.v.wan',
  tls_sni: 'flow.v.tlsSni',
  http_host: 'flow.v.httpHost',
  quic_sni: 'flow.v.quicSni',
  dns_mapping: 'flow.v.dnsMapping',
  explicit: 'flow.v.explicit'
};
// Why a trace is incomplete.
export const traceGaps: Record<string, Key> = {
  not_instrumented: 'flow.m.notInstrumented',
  started_late: 'flow.m.startedLate',
  buffer_overflow: 'flow.m.bufferOverflow',
  sampled: 'flow.m.sampled',
  redacted: 'flow.m.redacted',
  evicted: 'flow.m.evicted'
};
// The routing inputs a trace records, labelled like the connection detail; kernel field names stay as they are.
const inputLabels: Record<string, Key | string> = {
  src: 'ui.source',
  dst: 'conn.f.dst',
  domain: 'ui.domain',
  domain_source: 'conn.f.domainSource',
  ingress: 'conn.f.ingress',
  pname: 'ui.process',
  network: 'ui.protocol',
  dscp: 'DSCP',
  mark: 'fwmark',
  uid: 'UID',
  pid: 'PID'
};
// Known engine words become message keys; anything else stays as the engine reported it.
export const word = (value: string | null | undefined): string | MessageRef => (value == null ? '—' : flowWords[value] ? {key: flowWords[value]} : value);
const yesNo = (value: boolean | null | undefined): string | MessageRef => (value == null ? '—' : {key: value ? 'ui.yes' : 'ui.no'});

export function flowStepFields(step: FlowStep): Array<[Key | MessageRef, string | MessageRef]> | null {
  const text = (value: unknown) => (value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  switch (step.stage) {
    case 'input':
      return Object.entries(step.data.values)
        .filter(([, value]) => value != null && value !== '')
        .map(([name, value]) => {
          const label = inputLabels[name];
          const labelRef: Key | MessageRef =
            label === undefined || !label.includes('.') ? {key: 'flow.f.input', params: {name: label ?? name}} : (label as Key);
          return [labelRef, typeof value === 'string' ? word(value) : text(value)];
        });
    case 'route':
      return [
        ['flow.f.chain', step.data.chain],
        ['flow.f.plane', word(step.data.plane)],
        [
          'ui.rule',
          step.data.rules
            .filter(rule => rule.result === 'matched')
            .map(rule => rule.expression ?? rule.rule_id)
            .join(' · ') || '—'
        ],
        ['ui.outbound', text(step.data.outbound)],
        ['flow.f.must', yesNo(step.data.must)]
      ];
    case 'dial_mode':
      return [
        ['flow.f.dialTarget', step.data.configured + ' → ' + step.data.effective_target],
        ['flow.f.verification', word(step.data.verification)]
      ];
    case 'dns':
      return [
        ['ui.name', step.data.name],
        ['flow.f.source', word(step.data.source)],
        ['flow.f.cache', word(step.data.cache)],
        ['ui.upstream', text(step.data.upstream)],
        ['flow.f.selectedIp', text(step.data.selected_ip)]
      ];
    case 'outbound':
      return [
        ['ui.outbound', text(step.data.routed_outbound) + ' → ' + text(step.data.effective_outbound)],
        ['flow.f.selectionPath', step.data.selection_path.map(p => p.group_id + ' → ' + text(p.member_name ?? p.member_id)).join(' / ') || '—'],
        ['flow.f.leafNode', text(step.data.leaf_node_id)],
        ['ui.target', text(step.data.target)],
        ['ui.state', word(step.data.status)]
      ];
    case 'connection':
      return [
        ['ui.state', {key: connectionStates[step.data.state]}],
        ['flow.f.milestone', word(step.data.milestone)],
        ['flow.f.reason', word(step.data.reason)]
      ];
    case 'datapath':
      return [
        ['flow.f.plane', word(step.data.plane)],
        ['flow.f.action', word(step.data.action)],
        ['flow.f.reason', word(step.data.reason)]
      ];
    case 'reroute':
      return [
        ['flow.f.performed', yesNo(step.data.performed)],
        ['flow.f.reason', word(step.data.reason)]
      ];
    default:
      return null;
  }
}

const groupConfigLabels: Record<string, Key> = {
  default_member_id: 'policy.cfg.defaultMember',
  final_outbound: 'policy.cfg.finalOutbound',
  check_url: 'policy.cfg.checkUrl',
  check_interval: 'policy.cfg.checkInterval',
  tolerance: 'policy.cfg.tolerance',
  idle_timeout: 'policy.cfg.idleTimeout',
  interrupt_connections: 'policy.cfg.interruptConnections'
};
const secondsFields = new Set(['check_interval', 'idle_timeout']);
const millisFields = new Set(['tolerance']);
// Known fields get a label and a unit; anything the contract adds later shows its raw name.
export function groupConfigFields(group: Group): Array<[Key | MessageRef, string | MessageRef]> {
  return Object.entries(group.config)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => {
      const label: Key | MessageRef = groupConfigLabels[key] ?? {key: 'flow.f.input', params: {name: key}};
      if (typeof value === 'boolean') return [label, {key: value ? 'ui.yes' : 'ui.no'}];
      if (typeof value === 'number' && secondsFields.has(key)) return [label, {key: 'policy.cfg.seconds', params: {n: value}}];
      if (typeof value === 'number' && millisFields.has(key)) return [label, {key: 'policy.cfg.millis', params: {n: value}}];
      return [label, String(value)];
    });
}

// A member gets one row per address family; the one that says most wins: a failure over a success, a
// success over a family with no address.
const probeRank = {unknown: 0, healthy: 1, unavailable: 2};
export function probeSummary(result: ProbeResult): MessageRef {
  const members = new Map<string, 'healthy' | 'unavailable' | 'unknown'>();
  for (const item of result.results) {
    const previous = members.get(item.member_id);
    if (!previous || probeRank[item.state] > probeRank[previous]) members.set(item.member_id, item.state);
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
// Enum values shown to people go through the dictionary; anything outside the contract shows as is.
const datapathValues: Record<string, Key> = {
  ebpf: 'ov.v.ebpf',
  userspace: 'ov.v.userspace',
  mock: 'ov.v.mock',
  active: 'ov.v.active',
  degraded: 'ov.v.degraded',
  detached: 'ov.v.detached',
  failed: 'ov.v.failed',
  disabled: 'ov.v.disabled',
  full: 'ov.v.full',
  partial: 'ov.v.partial',
  none: 'ov.v.none',
  real: 'ov.v.real',
  loaded: 'ov.v.loaded',
  not_loaded: 'ov.v.notLoaded',
  attached: 'ov.v.attached',
  partially_attached: 'ov.v.partiallyAttached',
  published: 'ov.v.published',
  not_published: 'ov.v.notPublished',
  healthy: 'ov.v.healthy',
  ready: 'ov.v.ready',
  error: 'ov.v.error',
  unknown: 'ov.v.unknown',
  ingress: 'ov.v.ingress',
  egress: 'ov.v.egress'
};
export function datapathValue(value: string, label: LabelFn): string {
  return datapathValues[value] ? label(datapathValues[value]) : value;
}
export function datapathFields(datapath: Datapath, unknown: string, label: LabelFn): Array<[string, string]> {
  const ebpf = datapath.ebpf;
  const occupancy = ebpf?.maps?.conn_state;
  const v = (value: string) => datapathValue(value, label);
  return [
    [label('ov.f.kind'), v(datapath.kind)],
    [label('ov.f.state'), v(datapath.state)],
    [label('ov.f.visibility'), v(datapath.visibility)],
    ...(ebpf
      ? ([
          [label('ov.f.backend'), v(ebpf.backend)],
          [label('ov.f.programs'), v(ebpf.programs)],
          [label('ov.f.hooks'), v(ebpf.hooks)],
          [label('ov.f.routing'), v(ebpf.routing.state)],
          [label('ov.f.health'), v(ebpf.health)],
          [label('ov.f.maps'), v(ebpf.maps?.state ?? 'unknown')],
          [label('ov.f.connState'), occupancy?.occupancy_known && occupancy.occupancy !== null ? occupancy.occupancy + ' / ' + occupancy.capacity : unknown]
        ] as Array<[string, string]>)
      : [])
  ];
}
// The memory figures as rows; `omit` drops the ones a page shows another way (the cgroup bar on the overview).
const cgroupScopes: Record<'service' | 'shared' | 'unknown', Key> = {service: 'ov.v.cgroupService', shared: 'ov.v.cgroupShared', unknown: 'ui.unknown'};
export function memoryFields(memory: RuntimeMemory, label: LabelFn, omit: Key[] = []): Array<[string, string]> {
  const percent = pctU64(memory.cgroup?.current_bytes ?? null, memory.cgroup?.limit_bytes ?? null);
  const rows: Array<[Key, string]> = [
    ['ov.f.rss', formatBytes(memory.process?.rss_bytes ?? null)],
    ['ov.f.cgroupCurrent', formatBytes(memory.cgroup?.current_bytes ?? null)],
    ['ov.f.cgroupLimit', formatBytes(memory.cgroup?.limit_bytes ?? null)],
    ['ov.f.cgroupPercent', percent === null ? '—' : Math.round(percent) + '%'],
    // Whose cgroup: the service's own, one shared with other processes, or unknown (a desktop session slice
    // reads as the whole login), so the usage is not mistaken for the engine's alone.
    ['ov.f.cgroupScope', memory.cgroup ? label(cgroupScopes[memory.cgroup.scope]) : '—'],
    ['ov.f.oomHigh', memory.cgroup?.events?.high ?? '—'],
    ['ov.f.oom', memory.cgroup?.events?.oom ?? '—'],
    ['ov.f.oomKill', memory.cgroup?.events?.oom_kill ?? '—'],
    ['ov.f.ebpfBytes', formatBytes(memory.kernel?.ebpf_bytes ?? null)]
  ];
  return rows.filter(([key]) => !omit.includes(key)).map(([key, value]) => [label(key), value]);
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
export const eventKindLabels: Record<EventKind, Key> = {
  'stream.ready': 'event.k.streamReady',
  'runtime.updated': 'event.k.runtimeUpdated',
  'flow.updated': 'event.k.flowUpdated',
  'flow.gap': 'event.k.flowGap',
  'operation.updated': 'event.k.operationUpdated',
  'generation.changed': 'event.k.generationChanged'
};
// A flow record leaving the ring to make room (aged out, or pushed out of a full ring: no resource named), or
// a flow never recorded because sampling skipped it, is the backend's routine housekeeping; a record that
// lost its own history or a change in what gets recorded is a gap worth a notice.
export function routineGap(event: ApiEvent): boolean {
  if (event.event !== 'flow.gap') return false;
  const {reason, resource_id} = event.data;
  return reason === 'evicted' || reason === 'sampled' || (reason === 'buffer_overflow' && resource_id == null);
}
const gapReasons: Record<string, Key> = {
  buffer_overflow: 'event.gap.overflow',
  sampled: 'event.gap.sampled',
  evicted: 'event.gap.evicted',
  recording_changed: 'event.gap.recording'
};
export function eventSummary(event: ApiEvent, t?: (key: Key) => string): MessageRef {
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
      return {
        key: 'event.gap',
        params: {
          id: event.data.resource_id ?? '—',
          reason: t && gapReasons[event.data.reason] ? t(gapReasons[event.data.reason]) : event.data.reason,
          n: event.data.dropped_records ?? '—'
        }
      };
  }
}

// The first block of a UUID, enough to tell two apart on a strip; the full value goes in a tooltip.
export const shortId = (id: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : id);
