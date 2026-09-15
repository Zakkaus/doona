import type {Api} from '../api';
import type {ApiEvent, EventOptions, GroupSelectionResult, Operation, OperationAccepted, OperationState} from '../model';
import {ApiError} from '../error';
import {wait} from '../wait';
import * as fixtures from './fixtures';
import {flows as flowFixtures} from './flows';
import {patchGroupConfig, probeResult, resolveLeaf} from './control';

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
  try { const value = localStorage.getItem('doona-mock-big'); if (value !== null) count = Math.max(0, Math.floor(Number(value) || 0)); } catch {}
  const {nodes, groups} = fixtures.nodeFixtures(Number.isFinite(count) ? count : 100);
  const flows = structuredClone(flowFixtures);
  const connections = structuredClone(fixtures.connections);
  const revisions = new Map<string, bigint>();
  const operations = new Map<string, OperationState>();
  const updating = new Set<string>();
  const epoch = Date.now();
  function enqueue<K extends OperationAccepted['kind']>(kind: K, finish: () => Extract<Operation, {kind: K; status: 'succeeded'}>['result']): OperationAccepted {
    const operation_id = 'op-' + (operations.size + 1);
    const created_at = new Date().toISOString();
    const common = {operation_id, kind, created_at, started_at: created_at};
    operations.set(operation_id, {...common, finished_at: null, status: 'running', result: null, error: null, retryAfter: 1});
    setTimeout(() => {
      try { operations.set(operation_id, {...common, status: 'succeeded', result: finish(), error: null, finished_at: new Date().toISOString()} as OperationState); }
      catch (error) { operations.set(operation_id, {...common, status: 'failed', finished_at: new Date().toISOString(), result: null, error: {code: 'operation_failed', message: error instanceof Error ? error.message : String(error)}} as OperationState); }
    }, 1000);
    const href = '/api/v1/operations/' + operation_id;
    return {operation_id, kind, status: 'queued', href, location: href, retryAfter: 1};
  }
  const operation = async (id: string, signal?: AbortSignal): Promise<OperationState> => {
    signal?.throwIfAborted();
    return structuredClone(found(operations.get(id), 'Operation'));
  };
  async function events({kinds, lastEventId, signal, onEvent}: EventOptions): Promise<void> {
    let seq = Math.max(0, Math.floor((Date.now() - epoch) / 5000));
    if (lastEventId?.startsWith(fixtures.instanceId + ':')) seq = Math.max(seq, Number(lastEventId.split(':')[1]) || 0);
    const emit = (event: ApiEvent) => { if (event.event === 'stream.ready' || !kinds?.length || kinds.includes(event.event)) onEvent(event); };
    try {
      signal?.throwIfAborted();
      emit({id: `${fixtures.instanceId}:${++seq}`, event: 'stream.ready', data: {instance_id: fixtures.instanceId, observed_at: new Date().toISOString()}});
      while (!signal?.aborted) {
        await wait(5, signal);
        emit({id: `${fixtures.instanceId}:${++seq}`, event: 'runtime.updated', data: {instance_id: fixtures.instanceId, observed_at: new Date().toISOString(), href: '/api/v1/runtime'}});
      }
    } catch (error) { if (!signal?.aborted) throw error; }
  }
  return {
    version: async signal => { signal?.throwIfAborted(); return structuredClone(fixtures.version); },
    capabilities: async signal => { signal?.throwIfAborted(); return structuredClone(fixtures.capabilities); },
    runtime: async signal => { signal?.throwIfAborted(); return structuredClone(fixtures.runtime); },
    nodes: async (query, signal) => {
      signal?.throwIfAborted();
      const result = page(query?.group_id ? nodes.filter(n => n.group_ids.includes(query.group_id!)) : nodes, query?.cursor, query?.limit);
      return {observed_at: fixtures.observedAt, nodes: structuredClone(result.items), next_cursor: result.next_cursor};
    },
    groups: async signal => {
      signal?.throwIfAborted();
      return groups.map(g => ({id: g.id, name: g.name, policy: {...g.policy}, member_count: g.members.length, selection: {tcp_member_id: g.runtime.selection.tcp?.member_id ?? null, udp_member_id: g.runtime.selection.udp?.member_id ?? null}}));
    },
    group: async (id, signal) => { signal?.throwIfAborted(); return structuredClone(found(groups.find(g => g.id === id), 'Group')); },
    selectGroup: async (groupId, request, signal) => {
      signal?.throwIfAborted();
      const group = found(groups.find(g => g.id === groupId), 'Group');
      if (group.policy.kind !== 'selector' || !group.capabilities.can_select) throw new ApiError(409, 'selection_not_supported', 'Group does not support manual selection');
      found(group.members.find(m => m.id === request.member_id), 'Group member');
      const networks: Array<'tcp' | 'udp'> = request.network === 'both' ? ['tcp', 'udp'] : [request.network];
      let interrupted = false;
      for (const network of networks) {
        const previous = group.runtime.selection[network]?.member_id;
        group.runtime.selection[network] = {member_id: request.member_id, resolved_leaf_node_id: resolveLeaf(request.member_id, network, nodes, groups)?.id ?? null, source: 'runtime'};
        if (previous === request.member_id || !group.config.interrupt_connections) continue;
        for (const connection of connections[network]) {
          if (connection.outbound !== groupId || !['active', 'dialing', 'routing'].includes(connection.state)) continue;
          interrupted = true;
          connection.state = 'closed';
          connection.upload_bytes_per_second = connection.download_bytes_per_second = '0';
          const flow = flows.find(f => f.id === connection.flow_id);
          if (flow) {
            const observed_at = new Date().toISOString();
            const last = flow.trace.steps[flow.trace.steps.length - 1];
            flow.state = 'closed';
            flow.ended_at = observed_at;
            flow.revision++;
            flow.trace.steps.push({seq: (last?.seq ?? 0) + 1, observed_at, elapsed_us: Math.max(last?.elapsed_us ?? 0, (Date.now() - Date.parse(flow.started_at!)) * 1000), generation_id: '40', evidence: 'observed', stage: 'connection', data: {state: 'closed', milestone: 'terminal', reason: 'group_selection_changed', attempt_id: null, reply_received: null, error: null}});
          }
        }
      }
      const revision = (revisions.get(groupId) ?? 0n) + 1n;
      revisions.set(groupId, revision);
      const result: GroupSelectionResult = {group_id: groupId, member_id: request.member_id, network: request.network, source: 'runtime', selection_revision: String(revision), connections_interrupted: interrupted};
      if (request.network !== 'both') result.resolved_leaf_node_id = group.runtime.selection[request.network]?.resolved_leaf_node_id;
      return result;
    },
    patchGroup: async (groupId, ops, ifMatch, signal) => {
      signal?.throwIfAborted();
      const group = found(groups.find(g => g.id === groupId), 'Group');
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
      const group = target.type === 'group' ? found(groups.find(g => g.id === target.group_id), 'Group') : undefined;
      if (target.type === 'node') found(nodes.find(n => n.id === target.node_id), 'Node');
      if (!request.transport.length || request.transport.some(t => group && !group.capabilities.probe_transports.includes(t)) || (request.kind !== 'dns' && (request.purpose !== 'data' || request.transport.some(t => t !== 'tcp'))) || (request.kind === 'dns' && request.purpose !== 'dns')) throw new ApiError(422, 'invalid_probe', 'Unsupported probe dimensions');
      if (group && Array.isArray(request.members) && request.members.some(id => !group.members.some(m => m.id === id))) throw new ApiError(422, 'invalid_member', 'Probe member is not in this group');
      const input = structuredClone(request);
      return enqueue('probe', () => probeResult(input, nodes, groups, new Date().toISOString()));
    },
    connections: async (query, signal) => {
      signal?.throwIfAborted();
      const snapshot = structuredClone(connections);
      const tcp = query?.type === 'udp' ? [] : snapshot.tcp.slice(0, query?.limit);
      const udp = query?.type === 'tcp' ? [] : snapshot.udp.slice(0, query?.limit);
      return {...snapshot, tcp, udp, truncated: tcp.length < (query?.type === 'udp' ? 0 : snapshot.total_tcp) || udp.length < (query?.type === 'tcp' ? 0 : snapshot.total_udp)};
    },
    flows: async (query, signal) => {
      signal?.throwIfAborted();
      const result = page(flows.filter(f => (!query?.network || query.network === 'all' || f.network === query.network) && (!query?.state || query.state === 'all' || f.state === query.state)), query?.cursor, query?.limit);
      return {instance_id: fixtures.instanceId, observed_at: fixtures.observedAt, coverage: {userspace_tcp: 'full', userspace_udp: 'full', kernel_direct: 'partial', kernel_block: 'partial', dns_intercept: 'partial', kernel_bypass: 'none'}, dropped_records: '0', flows: structuredClone(result.items.map(({trace, ...summary}) => summary)), next_cursor: result.next_cursor};
    },
    flow: async (id, signal) => { signal?.throwIfAborted(); return structuredClone(found(flows.find(f => f.id === id), 'Flow')); },
    dnsCache: async (query, signal) => {
      signal?.throwIfAborted();
      const name = query?.name ?? query?.domain;
      const entries = fixtures.dnsCache.entries.filter(e => (!name || e.domain === name || e.domain === name + '.') && (!query?.type || query.type.includes(e.type)));
      const result = page(entries, query?.cursor, query?.limit);
      return {...fixtures.dnsCache, entries: structuredClone(result.items), total: entries.length, next_cursor: result.next_cursor};
    },
    startReload: async signal => {
      signal?.throwIfAborted();
      return enqueue('reload', () => ({active_generation_id: '40', datapath_generation_id: '40'}));
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
    subscribeEvents: events, history: () => fixtures.history
  };
}
