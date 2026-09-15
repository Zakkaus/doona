import type {Api} from '../api';
import type {ApiEvent, EventOptions, OperationAccepted, OperationState} from '../model';
import {ApiError} from '../error';
import {wait} from '../wait';
import * as fixtures from './fixtures';
import {flows} from './flows';

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
  const operations = new Map<string, number>();
  const epoch = Date.now();
  const operation = async (id: string, signal?: AbortSignal): Promise<OperationState> => {
    signal?.throwIfAborted();
    const created = found(operations.get(id), 'Operation');
    const common = {operation_id: id, kind: 'reload' as const, created_at: new Date(created).toISOString(), started_at: new Date(created).toISOString(), error: null};
    return Date.now() - created < 1000
      ? {...common, status: 'running', finished_at: null, result: null, retryAfter: 1}
      : {...common, status: 'succeeded', finished_at: new Date(created + 1000).toISOString(), result: {active_generation_id: '40', datapath_generation_id: '40'}};
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
    connections: async (query, signal) => {
      signal?.throwIfAborted();
      const snapshot = structuredClone(fixtures.connections);
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
      const operation_id = 'op-' + (operations.size + 1);
      operations.set(operation_id, Date.now());
      const href = '/api/v1/operations/' + operation_id;
      return {operation_id, kind: 'reload', status: 'queued', href, location: href, retryAfter: 1};
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
