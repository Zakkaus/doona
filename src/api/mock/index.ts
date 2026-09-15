import type {Api} from '../api';
import type {ApiEvent, EventOptions, GroupSelectionResult, Operation, OperationAccepted, OperationState} from '../model';
import {ApiError} from '../error';
import {wait} from '../wait';
import * as fixtures from './fixtures';
import {ipLiteral, sourceIp} from '../selectors';
import {patchGroupConfig, probeResult, resolveLeaf} from './control';
import {routingTrace} from './routing';

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

export function createMockApi(): Api {
  let count = 100;
  let big = false;
  try {
    const value = localStorage.getItem('doona-mock-big');
    big = value !== null;
    if (value !== null) count = Math.max(0, Math.floor(Number(value) || 0));
  } catch {}
  let capabilities = fixtures.capabilities;
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
      return structuredClone(fixtures.runtimeMemory);
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
      if (group.policy.kind !== 'selector' || !group.capabilities.can_select)
        throw new ApiError(409, 'selection_not_supported', 'Group does not support manual selection');
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
          source: 'runtime'
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
        source: 'runtime',
        selection_revision: String(revision),
        connections_interrupted: interrupted
      };
      if (request.network !== 'both') result.resolved_leaf_node_id = group.runtime.selection[request.network]?.resolved_leaf_node_id;
      return result;
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
        dropped_records: '0',
        flows: structuredClone(result.items.map(({trace, ...summary}) => summary)),
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
    configRules: () => fixtures.configRules
  };
}
