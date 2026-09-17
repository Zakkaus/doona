import type {Api} from '../api';
import type {
  ApiEvent,
  DnsLogRecord,
  EventOptions,
  FlowDetail,
  GroupSelectionResult,
  LogOptions,
  LogRecord,
  Operation,
  OperationAccepted,
  OperationState,
  RuntimeSettingsPatch
} from '../model';
import {ApiError} from '../error';
import {wait} from '../wait';
import * as fixtures from './fixtures';
import {ipLiteral, sourceIp} from '../selectors';
import {patchGroupConfig, probeResult, resolveLeaf} from './control';
import {routingTrace} from './routing';
import {diagnose, groupsIn, stored, validate} from './config';

function page<T>(items: T[], cursor?: string, limit = 1000) {
  const start = cursor ? Number(cursor) : 0;
  if (!Number.isSafeInteger(start) || start < 0 || start > items.length) throw new ApiError(400, 'invalid_cursor', 'Invalid mock cursor');
  const end = start + limit;
  return {items: items.slice(start, end), next_cursor: end < items.length ? String(end) : null};
}
function found<T>(value: T | undefined, kind: string): T {
  if (value === undefined) throw new ApiError(404, 'not_found', `${kind} not found`);
  return value;
}

// Every flow with a name resolved once: the record says who asked, what answered and how long it took.
function dnsLogRecords(flows: FlowDetail[]): DnsLogRecord[] {
  return [...flows]
    .filter(flow => flow.input.domain)
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
    .map((flow, i) => {
      const name = flow.input.domain!.replace(/\.$/, '') + '.';
      const cached = i % 3 === 1;
      const failed = !cached && i % 11 === 7;
      const type = flow.network === 'udp' && i % 2 ? 'AAAA' : 'A';
      const dst = flow.input.dst?.replace(/^\[|\]?:\d+$/g, '') ?? null;
      return {
        id: 'dl-' + String(i + 1).padStart(6, '0'),
        observed_at: new Date(Date.parse(flow.started_at ?? new Date().toISOString()) - 40).toISOString(),
        src: flow.input.src ?? null,
        question: {name, type},
        status: failed ? 'TIMEOUT' : 'NOERROR',
        cached,
        upstream: cached || failed ? null : flow.outbound === 'direct' ? 'udp://223.5.5.5' : 'tls://1.1.1.1',
        route: flow.outbound === 'direct' ? {source: 'dns.routing', rule: 'qname(geosite: cn) -> alidns'} : {source: 'default', rule: null},
        elapsed_ms: cached ? 0 : failed ? 5000 : 12 + ((i * 7) % 60),
        answers: failed || !dst ? [] : [{name, type, class: 'IN', ttl: 300, data: type === 'AAAA' ? '2001:db8::' + (i + 1).toString(16) : dst}]
      };
    });
}

export function createMockApi(): Api {
  let count = 100;
  let big = false;
  try {
    const value = localStorage.getItem('doona-mock-big');
    big = value !== null;
    if (value !== null) count = Math.max(0, Math.floor(Number(value) || 0));
  } catch {}
  let capabilities = fixtures.capabilities;
  const settings = structuredClone(fixtures.runtimeSettings);
  // Accepted configuration sources; hashes are filled in on first read and refreshed on replacement.
  let sources: Awaited<ReturnType<typeof stored>>[] | null = null;
  const loadSources = async () => (sources ??= await Promise.all(fixtures.configSources.map(stored)));
  let configRevision = 40;
  const providers = structuredClone(fixtures.providers);
  // The outbound mode: runtime state the next activation resets.
  let mode: {mode: 'rule' | 'direct' | 'global'; target: string | null; source: 'config' | 'runtime'} = {mode: 'rule', target: null, source: 'config'};
  // Only dae rule files are checked; subscription and generated sources hold node lists the checker does not read.
  const ruleFile = (source: {kind: string}) => source.kind === 'main' || source.kind === 'include';
  try {
    if (localStorage.getItem('doona-mock-profile') === 'base') capabilities = fixtures.capabilitiesBase;
  } catch {}
  const {nodes, groups} = fixtures.nodeFixtures(Number.isFinite(count) ? count : 100);
  const large = big ? fixtures.connectionFixtures() : undefined;
  const flows = large?.flows ?? structuredClone(fixtures.flows);
  const connections = large?.connections ?? structuredClone(fixtures.connections);
  const runtime = structuredClone(fixtures.runtime);
  const outbounds = structuredClone(fixtures.runtimeOutbounds);
  const dnsCache = structuredClone(fixtures.dnsCache);
  const revisions = new Map<string, bigint>();
  const operations = new Map<string, OperationState>();
  const updating = new Set<string>();
  let sequence = 0;
  const listeners = new Set<(event: ApiEvent) => void>();
  const history: ApiEvent[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  const eventData = () => ({instance_id: fixtures.instanceId, observed_at: new Date().toISOString()});
  function publish(event: ApiEvent) {
    event.id = `${fixtures.instanceId}:${++sequence}`;
    history.push(event);
    if (history.length > 1024) history.shift();
    listeners.forEach(listener => listener(event));
  }
  function runtimeUpdated() {
    runtime.observed_at = new Date().toISOString();
    publish({id: '', event: 'runtime.updated', data: {...eventData(), href: '/api/v1/runtime'}});
  }
  function enqueue<K extends OperationAccepted['kind']>(
    kind: K,
    finish: () => Extract<Operation, {kind: K; status: 'succeeded'}>['result']
  ): OperationAccepted {
    const operation_id = 'op-' + (operations.size + 1);
    const created_at = new Date().toISOString();
    const common = {operation_id, kind, created_at, started_at: created_at};
    operations.set(operation_id, {...common, finished_at: null, status: 'running', result: null, error: null, retryAfter: 1});
    publish({
      id: '',
      event: 'operation.updated',
      data: {...eventData(), resource_id: operation_id, status: 'running', href: '/api/v1/operations/' + operation_id}
    });
    setTimeout(() => {
      try {
        operations.set(operation_id, {...common, status: 'succeeded', result: finish(), error: null, finished_at: new Date().toISOString()} as OperationState);
      } catch (error) {
        operations.set(operation_id, {
          ...common,
          status: 'failed',
          finished_at: new Date().toISOString(),
          result: null,
          error: {code: 'operation_failed', message: error instanceof Error ? error.message : String(error)}
        } as OperationState);
      }
      const terminal = operations.get(operation_id)!;
      if (kind === 'reload' && (terminal.status === 'succeeded' || terminal.status === 'failed'))
        runtime.last_reload = {operation_id, status: terminal.status, finished_at: terminal.finished_at, error: terminal.error};
      publish({
        id: '',
        event: 'operation.updated',
        data: {...eventData(), resource_id: operation_id, status: terminal.status, href: '/api/v1/operations/' + operation_id}
      });
      runtimeUpdated();
    }, 1000);
    const href = '/api/v1/operations/' + operation_id;
    return {operation_id, kind, status: 'queued', href, location: href, retryAfter: 1};
  }
  const operation = async (id: string, signal?: AbortSignal): Promise<OperationState> => {
    signal?.throwIfAborted();
    return structuredClone(found(operations.get(id), 'Operation'));
  };
  // Logs: a bounded ring the stream replays from, fed by what the mock does plus a quiet background trickle.
  const levels: LogRecord['level'][] = ['trace', 'debug', 'info', 'warn', 'error'];
  const logRing: Array<LogRecord & {id: string}> = [];
  const logListeners = new Set<(record: LogRecord & {id: string}) => void>();
  let logSequence = 0;
  const log = (level: LogRecord['level'], target: string, message: string, fields: LogRecord['fields'] = null) => {
    const record = {id: `${fixtures.instanceId}:logs:${++logSequence}`, ts: new Date().toISOString(), level, target, message, fields};
    logRing.push(record);
    if (logRing.length > settings.log.buffered_records) logRing.splice(0, logRing.length - settings.log.buffered_records);
    logListeners.forEach(listener => listener(record));
  };
  const trickle = [
    () => log('info', 'honk::routing', 'Routing generation published.', {generation_id: String(configRevision)}),
    () => log('debug', 'honk::dns', 'Upstream answered.', {upstream: 'tls://1.1.1.1:853', elapsed_ms: 12}),
    () => log('info', 'honk::group', 'Health check finished.', {group: 'resilient', healthy: 3, unavailable: 0}),
    () => log('warn', 'honk::subscription', 'Subscription served from cache.', {provider: 'sub-c', age_seconds: 1800}),
    () => log('trace', 'honk::datapath', 'Kernel map synced.', {entries: 4096})
  ];
  for (const record of fixtures.logSeed) log(record.level, record.target, record.message, record.fields ?? null);
  let logTimer: ReturnType<typeof setInterval> | undefined;
  async function logs({level, target, lastEventId, signal, onRecord, onConnectionChange}: LogOptions): Promise<void> {
    if (signal?.aborted) return;
    if (!capabilities.resources.logs.available) throw new ApiError(404, 'capability_not_supported', 'Logs are unavailable');
    const floor = level ? levels.indexOf(level) : 0;
    const emit = (record: LogRecord & {id: string}) => {
      if (levels.indexOf(record.level) >= floor && (!target || record.target.startsWith(target))) onRecord(structuredClone(record));
    };
    const cursor = lastEventId?.startsWith(fixtures.instanceId + ':logs:') ? Number(lastEventId.split(':')[2]) : 0;
    onConnectionChange?.(true);
    for (const record of logRing) if (Number(record.id.split(':')[2]) > cursor) emit(record);
    logListeners.add(emit);
    if (!logTimer) logTimer = setInterval(() => trickle[Math.floor(Math.random() * trickle.length)](), 2500);
    await new Promise<void>(resolve => {
      signal?.addEventListener(
        'abort',
        () => {
          logListeners.delete(emit);
          if (!logListeners.size) {
            clearInterval(logTimer);
            logTimer = undefined;
          }
          onConnectionChange?.(false);
          resolve();
        },
        {once: true}
      );
    });
  }
  async function events({kinds, lastEventId, signal, onEvent, onConnectionChange}: EventOptions): Promise<void> {
    if (signal?.aborted) return;
    const emit = (event: ApiEvent) => {
      if (event.event === 'stream.ready' || !kinds?.length || kinds.includes(event.event)) onEvent(structuredClone(event));
    };
    const cursor = lastEventId?.startsWith(fixtures.instanceId + ':') ? Number(lastEventId.split(':')[1]) : sequence;
    onConnectionChange?.(true);
    emit({id: `${fixtures.instanceId}:${Number.isFinite(cursor) ? cursor : sequence}`, event: 'stream.ready', data: eventData()});
    for (const event of history) if (Number(event.id.split(':')[1]) > cursor) emit(event);
    if (signal?.aborted) {
      onConnectionChange?.(false);
      return;
    }
    listeners.add(emit);
    if (!timer) timer = setInterval(runtimeUpdated, 5000);
    await new Promise<void>(resolve => {
      signal?.addEventListener(
        'abort',
        () => {
          listeners.delete(emit);
          if (!listeners.size) {
            clearInterval(timer);
            timer = undefined;
          }
          onConnectionChange?.(false);
          resolve();
        },
        {once: true}
      );
    });
  }
  return {
    discovery: async signal => {
      signal?.throwIfAborted();
      return {
        name: 'dae/honk-native',
        status: 'draft',
        api_major: 1,
        base_path: '/api/v1',
        links: {
          version: '/api/v1/version',
          capabilities: '/api/v1/capabilities',
          runtime: '/api/v1/runtime',
          runtime_outbounds: '/api/v1/runtime/outbounds',
          config: '/api/v1/config',
          config_validate: '/api/v1/config/validate',
          traffic_history: '/api/v1/runtime/traffic/history',
          memory_history: '/api/v1/runtime/memory/history',
          runtime_mode: '/api/v1/runtime/mode',
          logs: '/api/v1/logs',
          providers: '/api/v1/providers',
          rules: '/api/v1/rules',
          operations: '/api/v1/operations/{id}'
        }
      };
    },
    version: async signal => {
      signal?.throwIfAborted();
      return structuredClone(fixtures.version);
    },
    capabilities: async signal => {
      signal?.throwIfAborted();
      return structuredClone(capabilities);
    },
    runtime: async signal => {
      signal?.throwIfAborted();
      if (runtime.lifecycle.started_at)
        runtime.lifecycle.uptime_seconds = String(Math.max(0, Math.floor((Date.now() - Date.parse(runtime.lifecycle.started_at)) / 1000)));
      return structuredClone(runtime);
    },
    runtimeOutbounds: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.runtime_outbounds.available) throw new ApiError(404, 'not_found', 'Outbound counters unavailable');
      return structuredClone(outbounds);
    },
    trafficHistory: async (query, signal) => {
      signal?.throwIfAborted();
      const limits = capabilities.resources.traffic_history;
      if (!limits.available) throw new ApiError(404, 'not_found', 'Traffic history unavailable');
      const window_seconds = query?.window_seconds ?? limits.max_window_seconds!;
      const max_points = query?.max_points ?? limits.max_points!;
      if (
        !Number.isSafeInteger(window_seconds) ||
        window_seconds < 1 ||
        window_seconds > limits.max_window_seconds! ||
        !Number.isSafeInteger(max_points) ||
        max_points < 1 ||
        max_points > limits.max_points!
      )
        throw new ApiError(400, 'invalid_request', 'History query exceeds the advertised limits');
      const history = fixtures.trafficHistory;
      const samples = history.samples.filter(s => Date.parse(s.sampled_at) > Date.parse(history.observed_at) - window_seconds * 1000);
      const stride = Math.max(1, Math.ceil(samples.length / max_points));
      return {
        ...history,
        window_seconds,
        sampled_every_seconds: history.sampled_every_seconds * stride,
        samples: structuredClone(samples.filter((_, i) => (samples.length - 1 - i) % stride === 0))
      };
    },
    memoryHistory: async (query, signal) => {
      signal?.throwIfAborted();
      const limits = capabilities.resources.memory_history;
      if (!limits.available) throw new ApiError(404, 'not_found', 'Memory history unavailable');
      const window_seconds = query?.window_seconds ?? limits.max_window_seconds!;
      const max_points = query?.max_points ?? limits.max_points!;
      if (
        !Number.isSafeInteger(window_seconds) ||
        window_seconds < 1 ||
        window_seconds > limits.max_window_seconds! ||
        !Number.isSafeInteger(max_points) ||
        max_points < 1 ||
        max_points > limits.max_points!
      )
        throw new ApiError(400, 'invalid_request', 'History query exceeds the advertised limits');
      // The ring is synthesised on read: one sample every five seconds back through the window, with the
      // same slow drift the memory snapshot follows, so the curve and the tile agree at the newest point.
      const now = Date.now();
      const every = 5;
      const count = Math.min(Math.floor(window_seconds / every), max_points);
      const stride = Math.max(1, Math.ceil(window_seconds / every / max_points));
      const samples = Array.from({length: count}, (_, i) => {
        const at = now - (count - 1 - i) * every * stride * 1000;
        const drift = 1 + 0.04 * Math.sin(at / 60000);
        return {
          sampled_at: new Date(at).toISOString(),
          rss_bytes: String(Math.round(Number(fixtures.runtimeMemory.process!.rss_bytes) * drift)),
          cgroup_current_bytes: String(Math.round(Number(fixtures.runtimeMemory.cgroup!.current_bytes) * drift)),
          kernel_ebpf_bytes: fixtures.runtimeMemory.kernel?.ebpf_bytes ?? null
        };
      });
      return {observed_at: new Date(now).toISOString(), window_seconds, sampled_every_seconds: every * stride, samples};
    },
    datapath: async (detail, signal) => {
      signal?.throwIfAborted();
      const snapshot = structuredClone(fixtures.datapath);
      if (detail !== 'full' && snapshot.ebpf) {
        delete snapshot.ebpf.attachments;
        delete snapshot.ebpf.maps;
      }
      return snapshot;
    },
    runtimeMemory: async signal => {
      signal?.throwIfAborted();
      // Each poll is a fresh observation with a little drift, so memory sparklines and charts get a shape.
      const memory = structuredClone(fixtures.runtimeMemory);
      const now = Date.now();
      const drift = 1 + 0.04 * Math.sin(now / 60000);
      memory.observed_at = new Date(now).toISOString();
      memory.process = {rss_bytes: String(Math.round(Number(fixtures.runtimeMemory.process!.rss_bytes) * drift))};
      memory.cgroup = {...memory.cgroup!, current_bytes: String(Math.round(Number(fixtures.runtimeMemory.cgroup!.current_bytes) * drift))};
      return memory;
    },
    nodes: async (query, signal) => {
      signal?.throwIfAborted();
      const result = page(query?.group_id ? nodes.filter(n => n.group_ids.includes(query.group_id!)) : nodes, query?.cursor, query?.limit);
      return {observed_at: fixtures.observedAt, nodes: structuredClone(result.items), next_cursor: result.next_cursor};
    },
    groups: async signal => {
      signal?.throwIfAborted();
      return groups.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        config_revision: g.config_revision,
        policy: {...g.policy},
        member_count: g.members.length,
        selection: {tcp_member_id: g.runtime.selection.tcp?.member_id ?? null, udp_member_id: g.runtime.selection.udp?.member_id ?? null}
      }));
    },
    group: async (id, signal) => {
      signal?.throwIfAborted();
      return structuredClone(
        found(
          groups.find(g => g.id === id),
          'Group'
        )
      );
    },
    selectGroup: async (groupId, request, signal) => {
      signal?.throwIfAborted();
      const group = found(
        groups.find(g => g.id === groupId),
        'Group'
      );
      // A selector takes the choice; an automatic policy takes it as a pin that stands until cleared.
      const override = !group.capabilities.can_select && group.capabilities.can_override;
      if (!group.capabilities.can_select && !override) throw new ApiError(422, 'selection_not_supported', 'Group does not support manual selection');
      found(
        group.members.find(m => m.id === request.member_id),
        'Group member'
      );
      const networks: Array<'tcp' | 'udp'> = request.network === 'both' ? ['tcp', 'udp'] : [request.network];
      let interrupted = false;
      for (const network of networks) {
        const previous = group.runtime.selection[network]?.member_id;
        group.runtime.selection[network] = {
          member_id: request.member_id,
          resolved_leaf_node_id: resolveLeaf(request.member_id, network, nodes, groups)?.id ?? null,
          source: override ? 'override' : 'runtime'
        };
        if (previous === request.member_id || !group.config.interrupt_connections) continue;
        for (const connection of connections[network]) {
          if (connection.outbound !== groupId || !['active', 'dialing', 'routing'].includes(connection.state)) continue;
          interrupted = true;
          if (connection.state === 'active') {
            const counter = outbounds.outbounds.find(row => row.name === connection.outbound);
            if (counter) counter.active_connections--;
          }
          connection.state = 'closed';
          connection.upload_bytes_per_second = connection.download_bytes_per_second = '0';
          const flow = flows.find(f => f.connection_id === connection.id);
          if (flow) {
            const observed_at = new Date().toISOString();
            const last = flow.trace.steps[flow.trace.steps.length - 1];
            flow.state = 'closed';
            flow.ended_at = observed_at;
            flow.revision++;
            flow.trace.steps.push({
              seq: (last?.seq ?? 0) + 1,
              observed_at,
              elapsed_us: Math.max(last?.elapsed_us ?? 0, (Date.now() - Date.parse(flow.started_at!)) * 1000),
              generation_id: '40',
              evidence: 'observed',
              stage: 'connection',
              data: {state: 'closed', milestone: 'terminal', reason: 'group_selection_changed', attempt_id: null, reply_received: null, error: null}
            });
          }
        }
      }
      const revision = (revisions.get(groupId) ?? 0n) + 1n;
      revisions.set(groupId, revision);
      const result: GroupSelectionResult = {
        group_id: groupId,
        member_id: request.member_id,
        network: request.network,
        source: override ? 'override' : 'runtime',
        selection_revision: String(revision),
        connections_interrupted: interrupted
      };
      if (request.network !== 'both') result.resolved_leaf_node_id = group.runtime.selection[request.network]?.resolved_leaf_node_id;
      return result;
    },
    // Back to the policy's own pick: the pin goes and the member the policy last ranked first comes back.
    clearGroupOverride: async (groupId, network, signal) => {
      signal?.throwIfAborted();
      const group = found(
        groups.find(g => g.id === groupId),
        'Group'
      );
      if (!group.capabilities.can_override) throw new ApiError(409, 'state_conflict', 'Group has no override to clear');
      const networks: Array<'tcp' | 'udp'> = network === 'both' ? ['tcp', 'udp'] : [network];
      const chosen = fixtures.policyPick(group);
      for (const item of networks) {
        group.runtime.selection[item] = {member_id: chosen, resolved_leaf_node_id: resolveLeaf(chosen, item, nodes, groups)?.id ?? null, source: 'policy'};
      }
      const revision = (revisions.get(groupId) ?? 0n) + 1n;
      revisions.set(groupId, revision);
      return {
        group_id: groupId,
        member_id: chosen,
        resolved_leaf_node_id: network === 'both' ? undefined : group.runtime.selection[network]?.resolved_leaf_node_id,
        network,
        source: 'policy',
        selection_revision: String(revision),
        connections_interrupted: false
      };
    },
    patchGroup: async (groupId, ops, ifMatch, signal) => {
      signal?.throwIfAborted();
      const group = found(
        groups.find(g => g.id === groupId),
        'Group'
      );
      if (ifMatch !== '"' + group.config_revision + '"') throw new ApiError(412, 'revision_mismatch', 'Group configuration revision changed');
      if (updating.has(groupId)) throw new ApiError(409, 'update_pending', 'Group update is pending');
      const limit = fixtures.capabilities.resources.groups.max_patch_operations;
      if (limit !== undefined && ops.length > limit) throw new ApiError(422, 'too_many_operations', 'Too many patch operations');
      const updated = patchGroupConfig(group, ops);
      updating.add(groupId);
      return enqueue('group_update', () => {
        Object.assign(group, updated);
        group.config_revision = String(BigInt(group.config_revision) + 1n);
        group.capabilities.can_select = group.policy.kind === 'selector';
        updating.delete(groupId);
        return {group_id: groupId, config_revision: group.config_revision};
      });
    },
    startProbe: async (request, signal) => {
      signal?.throwIfAborted();
      const target = request.target;
      const group =
        target.type === 'group'
          ? found(
              groups.find(g => g.id === target.group_id),
              'Group'
            )
          : undefined;
      if (target.type === 'node')
        found(
          nodes.find(n => n.id === target.node_id),
          'Node'
        );
      if (
        !request.transport.length ||
        request.transport.some(t => group && !group.capabilities.probe_transports.includes(t)) ||
        (request.kind !== 'dns' && (request.purpose !== 'data' || request.transport.some(t => t !== 'tcp'))) ||
        (request.kind === 'dns' && request.purpose !== 'dns')
      )
        throw new ApiError(422, 'invalid_probe', 'Unsupported probe dimensions');
      if (group && Array.isArray(request.members) && request.members.some(id => !group.members.some(m => m.id === id)))
        throw new ApiError(422, 'invalid_member', 'Probe member is not in this group');
      const input = structuredClone(request);
      return enqueue('probe', () => probeResult(input, nodes, groups, new Date().toISOString()));
    },
    connections: async (query, signal) => {
      signal?.throwIfAborted();
      const src = query?.src === undefined ? undefined : ipLiteral(query.src);
      if (query?.src !== undefined && !src) throw new ApiError(400, 'invalid_request', 'Expected a source IP literal');
      const tcp = query?.type === 'udp' ? [] : connections.tcp.filter(c => !src || sourceIp(c.src) === src);
      const udp = query?.type === 'tcp' ? [] : connections.udp.filter(c => !src || sourceIp(c.src) === src);
      const limit = query?.limit ?? 1000;
      return {
        ...connections,
        total_tcp: tcp.length,
        total_udp: udp.length,
        tcp: structuredClone(tcp.slice(0, limit)),
        udp: structuredClone(udp.slice(0, Math.max(0, limit - tcp.length))),
        truncated: tcp.length + udp.length > limit
      };
    },
    flows: async (query, signal) => {
      signal?.throwIfAborted();
      const result = page(
        flows.filter(
          f =>
            (!query?.network || query.network === 'all' || f.network === query.network) &&
            (!query?.state || query.state === 'all' || f.state === query.state) &&
            (query?.connection_id === undefined || f.connection_id === query.connection_id)
        ),
        query?.cursor,
        query?.limit
      );
      return {
        instance_id: fixtures.instanceId,
        observed_at: fixtures.observedAt,
        coverage: {
          userspace_tcp: 'full',
          userspace_udp: 'full',
          kernel_direct: 'partial',
          kernel_block: 'partial',
          dns_intercept: 'partial',
          kernel_bypass: 'none'
        },
        dropped_records: big ? '0' : fixtures.flowDroppedRecords,
        flows: structuredClone(result.items.map(({trace, input, ...summary}) => (fixtures.flowSummaryOmitsInput[summary.id] ? summary : {...summary, input}))),
        next_cursor: result.next_cursor
      };
    },
    flow: async (id, signal) => {
      signal?.throwIfAborted();
      return structuredClone(
        found(
          flows.find(f => f.id === id),
          'Flow'
        )
      );
    },
    routingTrace: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.routing_trace.available) throw new ApiError(501, 'not_supported', 'Routing trace is unavailable');
      return routingTrace(request);
    },
    dnsCache: async (query, signal) => {
      signal?.throwIfAborted();
      const name = query?.name ?? query?.domain;
      const entries = dnsCache.entries.filter(e => (!name || e.domain === name || e.domain === name + '.') && (!query?.type || query.type.includes(e.type)));
      const result = page(entries, query?.cursor, query?.limit);
      return {...dnsCache, coverage: {...dnsCache.coverage}, entries: structuredClone(result.items), total: entries.length, next_cursor: result.next_cursor};
    },
    dnsLog: async (query, signal) => {
      signal?.throwIfAborted();
      const limits = capabilities.resources.dns_log;
      if (!limits.available) throw new ApiError(404, 'not_found', 'DNS log unavailable');
      if (query?.limit !== undefined && query.limit > limits.max_page_size!)
        throw new ApiError(400, 'invalid_request', 'limit exceeds the advertised page size');
      const needle = query?.name?.toLowerCase();
      const src = query?.src === undefined ? undefined : ipLiteral(query.src);
      const records = dnsLogRecords(flows).filter(
        r =>
          (!needle || r.question.name.toLowerCase().includes(needle)) &&
          (!query?.type || r.question.type === query.type) &&
          (!src || (r.src !== null && sourceIp(r.src) === src))
      );
      const result = page(records, query?.cursor, query?.limit ?? 200);
      return {observed_at: new Date().toISOString(), total: records.length, next_cursor: result.next_cursor, records: structuredClone(result.items)};
    },
    dnsQuery: async (domain, types, signal) => {
      signal?.throwIfAborted();
      const name = domain.trim().toLowerCase().replace(/\.$/, '') + '.';
      return {
        domain: name,
        cache_mode: 'normal',
        query_time: new Date().toISOString(),
        results: types.map(type => {
          const entry = dnsCache.entries.find(e => e.domain === name && e.type === type && Date.parse(e.expires_at) > Date.now());
          const data = type === 'AAAA' ? '2001:db8::14' : type === 'HTTPS' ? '1 . alpn="h2"' : '192.0.2.14';
          return {
            type,
            cached: !!entry,
            cache_entry_id: entry?.entry_id ?? null,
            upstream: entry ? null : 'udp://192.0.2.53',
            route: {source: 'default' as const, rule: null},
            status: entry?.status ?? 'NOERROR',
            elapsed_ms: entry ? 0.1 : 8.4,
            question: {name, type},
            answers: entry ? structuredClone(entry.answers ?? []) : [{name, type, class: 'IN', ttl: 60, data}]
          };
        })
      };
    },
    closeConnection: async (connectionId, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.connections.can_close) throw new ApiError(404, 'capability_not_supported', 'Closing connections is unavailable');
      for (const list of [connections.tcp, connections.udp]) {
        const index = list.findIndex(c => c.id === connectionId);
        if (index < 0) continue;
        // Only the userspace datapath can cancel what it owns; kernel-observed entries stay.
        if (list[index].observed_by === 'ebpf') throw new ApiError(409, 'state_conflict', 'Connection is not owned by the userspace datapath');
        list.splice(index, 1);
        return;
      }
      throw new ApiError(404, 'resource_not_found', 'Connection not found');
    },
    runtimeMode: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.runtime_mode.available) throw new ApiError(404, 'capability_not_supported', 'Outbound mode is unavailable');
      return {observed_at: new Date().toISOString(), ...mode};
    },
    setRuntimeMode: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.runtime_mode.available) throw new ApiError(404, 'capability_not_supported', 'Outbound mode is unavailable');
      if (!capabilities.resources.runtime_mode.modes?.includes(request.mode))
        throw new ApiError(400, 'invalid_request', `Mode ${request.mode} is not advertised`);
      if (request.mode === 'global') {
        if (!request.target) throw new ApiError(400, 'invalid_request', 'global needs a target');
        if (!groups.some(g => g.id === request.target) && !nodes.some(n => n.id === request.target))
          throw new ApiError(422, 'unsupported_value', `No group or node named ${request.target}`);
      } else if (request.target) throw new ApiError(400, 'invalid_request', `${request.mode} takes no target`);
      mode = {mode: request.mode, target: request.mode === 'global' ? request.target! : null, source: 'runtime'};
      log('info', 'honk::routing', 'Outbound mode changed.', {mode: mode.mode, target: mode.target});
      publish({id: '', event: 'runtime.updated', data: {...eventData(), href: '/api/v1/runtime'}});
      return {observed_at: new Date().toISOString(), ...mode};
    },
    providers: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.providers.available) throw new ApiError(404, 'capability_not_supported', 'Providers are unavailable');
      return {providers: structuredClone(providers), next_cursor: null};
    },
    // A refresh re-reads the source; the demo keeps the node set and moves the timestamps.
    refreshProvider: async (providerId, signal) => {
      signal?.throwIfAborted();
      const provider = found(
        providers.find(item => item.id === providerId),
        'Provider'
      );
      if (!capabilities.resources.providers.can_refresh || provider.kind !== 'subscription')
        throw new ApiError(409, 'state_conflict', 'This provider cannot be refreshed');
      return enqueue('provider_refresh', () => {
        provider.updated_at = new Date().toISOString();
        provider.status = 'ok';
        provider.last_error = null;
        return structuredClone(provider);
      });
    },
    config: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.config.available) throw new ApiError(404, 'capability_not_supported', 'Configuration readback is unavailable');
      const list = await loadSources();
      const generation = String(configRevision);
      const known = new Set(groups.map(g => g.name));
      return {
        generation_id: generation,
        revision: generation,
        sources: list.map(source => (capabilities.resources.config.content ? {...source} : {...source, content: undefined})),
        diagnostics: [
          ...list.filter(ruleFile).flatMap(source => diagnose(source.id, source.content, known, 'full').filter(item => item.level !== 'error')),
          ...fixtures.configNotes
        ],
        secrets_redacted: true
      };
    },
    configSource: async (sourceId, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.config.available) throw new ApiError(404, 'capability_not_supported', 'Configuration readback is unavailable');
      const source = found(
        (await loadSources()).find(item => item.id === sourceId),
        'Configuration source'
      );
      return capabilities.resources.config.content ? {...source} : {...source, content: undefined};
    },
    validateConfig: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.config_validate.available) throw new ApiError(404, 'capability_not_supported', 'Validation is unavailable');
      if (!capabilities.resources.config_validate.modes?.includes(request.mode))
        throw new ApiError(400, 'invalid_request', `Mode ${request.mode} is not advertised`);
      return validate(request, String(configRevision), new Set(groups.map(g => g.name)));
    },
    // The editing contract in order: If-Match present and current, full validation clean, then the write and a reload.
    replaceConfigSource: async (sourceId, content, ifMatch, signal) => {
      signal?.throwIfAborted();
      const list = await loadSources();
      const source = found(
        list.find(item => item.id === sourceId),
        'Configuration source'
      );
      if (!capabilities.resources.config.writable || !source.writable) throw new ApiError(403, 'permission_denied', 'This source is read-only');
      if (!ifMatch) throw new ApiError(428, 'precondition_required', 'If-Match is required');
      if (ifMatch.replace(/^"|"$/g, '') !== source.content_sha256)
        throw new ApiError(412, 'stale_revision', 'The source changed on disk; fetch it again before retrying');
      const main = sourceId === 'src-main' ? content : list[0].content;
      const known = new Set([...groupsIn(main), ...groups.map(g => g.name)]);
      const diagnostics = list.filter(ruleFile).flatMap(item => diagnose(item.id, item.id === sourceId ? content : item.content, known, 'full'));
      if (diagnostics.some(item => item.level === 'error'))
        throw new ApiError(422, 'unsupported_value', 'Validation found errors; nothing was written', null, {diagnostics});
      const next = await stored({...source, content, loaded_at: new Date().toISOString()});
      Object.assign(source, next);
      log('info', 'honk::config', 'Configuration source replaced; reloading.', {source_id: sourceId});
      return enqueue('reload', () => {
        configRevision += 1;
        mode = {mode: 'rule', target: null, source: 'config'};
        log('info', 'honk::routing', 'Routing generation published.', {generation_id: String(configRevision)});
        const generation = String(configRevision);
        runtime.generation = {...runtime.generation, active_id: generation, config_revision: generation, activated_at: new Date().toISOString()};
        publish({id: '', event: 'generation.changed', data: {...eventData(), generation_id: generation, previous_generation_id: String(configRevision - 1)}});
        return {active_generation_id: generation, datapath_generation_id: generation};
      });
    },
    runtimeSettings: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.runtime_settings.available) throw new ApiError(404, 'capability_not_supported', 'Runtime settings are unavailable');
      return structuredClone(settings);
    },
    // Merge semantics: every value is checked against its ceiling before anything changes.
    patchRuntimeSettings: async (patch, signal) => {
      signal?.throwIfAborted();
      const resources = capabilities.resources;
      if (!resources.runtime_settings.available) throw new ApiError(404, 'capability_not_supported', 'Runtime settings are unavailable');
      const allowed = new Set(resources.runtime_settings.fields ?? []);
      const ceilings = {
        'log.buffered_records': resources.logs.max_buffered_records ?? 0,
        'dns_log.max_records': resources.dns_log.max_records ?? 0,
        'flows.max_flows': resources.flows.max_flows ?? 0,
        'flows.retention_seconds': resources.flows.retention_seconds ?? 0
      };
      const invalid = (message: string) => new ApiError(400, 'invalid_request', message);
      const fields = Object.entries(patch).flatMap(([section, values]) =>
        Object.entries(values ?? {}).map(([field, value]) => [`${section}.${field}`, value] as const)
      );
      for (const [field, value] of fields) {
        if (!allowed.has(field as never)) throw invalid(`${field} cannot be changed on this backend`);
        if (field === 'log.level') {
          if (!(resources.logs.levels ?? []).includes(value as never)) throw invalid(`${value} is not an advertised log level`);
          continue;
        }
        const ceiling = ceilings[field as keyof typeof ceilings];
        const floor = field === 'flows.retention_seconds' ? 1 : 64;
        if (!Number.isInteger(value) || (value as number) < floor || (value as number) > ceiling) throw invalid(`${field} must lie in [${floor}, ${ceiling}]`);
      }
      const apply = <S extends keyof RuntimeSettingsPatch>(section: S) => Object.assign(settings[section], patch[section] ?? {});
      apply('log');
      apply('dns_log');
      apply('flows');
      settings.source = 'runtime';
      settings.observed_at = new Date().toISOString();
      log('info', 'honk::settings', 'Runtime settings changed.', {fields: fields.map(([field]) => field)});
      return structuredClone(settings);
    },
    deleteDnsEntry: async (entryId, signal) => {
      signal?.throwIfAborted();
      const index = dnsCache.entries.findIndex(entry => entry.entry_id === entryId);
      if (index < 0) return {deleted: 0};
      dnsCache.entries.splice(index, 1);
      return {deleted: 1};
    },
    flushDnsCache: async signal => {
      signal?.throwIfAborted();
      const matched = dnsCache.entries.length;
      dnsCache.entries.length = 0;
      return {matched, deleted: matched};
    },
    startReload: async signal => {
      signal?.throwIfAborted();
      return enqueue('reload', () => ({active_generation_id: '40', datapath_generation_id: '40'}));
    },
    startSuspend: async signal => {
      signal?.throwIfAborted();
      return enqueue('suspend', () => {
        runtime.lifecycle.state = 'suspended';
        return {runtime_state: 'suspended'};
      });
    },
    startResume: async signal => {
      signal?.throwIfAborted();
      return enqueue('resume', () => {
        runtime.lifecycle.state = 'running';
        return {runtime_state: 'running'};
      });
    },
    operation,
    pollOperation: async (accepted: OperationAccepted, signal?: AbortSignal) => {
      let delay = accepted.retryAfter;
      while (true) {
        await wait(delay, signal);
        const current = await operation(accepted.href.split('/').pop()!, signal);
        if (current.status === 'succeeded' || current.status === 'failed') return current;
        delay = current.retryAfter ?? 1;
      }
    },
    subscribeEvents: events,
    subscribeLogs: logs
  };
}
