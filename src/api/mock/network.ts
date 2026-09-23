import type {Api} from '../api';
import type {Capabilities, DnsLogRecord, FlowDetail, RuleList, RuntimeOutbounds} from '../model';
import {ApiError} from '../error';
import {ipLiteral, sourceIp} from '../selectors';
import * as fixtures from './fixtures/network';
import {instanceId, observedAt} from './fixtures/clock';
import {found, createPager} from './common';
import {routingTrace} from './routing';

const dnsRings = new WeakMap<FlowDetail[], DnsLogRecord[]>();
// Derived once per flows array; a real backend keeps its ring, so the mock should not re-sort on every poll.
function dnsLogRecords(flows: FlowDetail[]): DnsLogRecord[] {
  let ring = dnsRings.get(flows);
  if (!ring) dnsRings.set(flows, (ring = buildDnsLog(flows)));
  return ring;
}
function buildDnsLog(flows: FlowDetail[]): DnsLogRecord[] {
  return [...flows]
    .filter(flow => flow.input.domain)
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
    .map((flow, i) => {
      const name = flow.input.domain!.replace(/\.$/, '') + '.';
      const cached = i % 3 === 1;
      const failed = !cached && i % 11 === 7;
      // Enough variety for the analysis card: a cached negative answer, a no-such-name, a third upstream, slow tails.
      const missing = i % 13 === 5 || i % 13 === 4;
      const status = failed ? (i % 2 ? 'TIMEOUT' : 'SERVFAIL') : missing ? 'NXDOMAIN' : 'NOERROR';
      const type = (flow.network === 'udp' && i % 2) || i % 5 === 2 ? 'AAAA' : i % 11 === 3 ? 'HTTPS' : 'A';
      const dst = flow.input.dst?.replace(/^\[|\]?:\d+$/g, '') ?? null;
      return {
        id: 'dl-' + String(i + 1).padStart(6, '0'),
        observed_at: new Date(Date.parse(flow.started_at ?? new Date().toISOString()) - 40).toISOString(),
        src: flow.input.src ?? null,
        question: {name, type},
        status,
        cached,
        upstream:
          cached || (failed && i % 2) ? null : flow.outbound === 'direct' ? 'udp://223.5.5.5' : i % 4 === 0 ? 'https://dns.google/dns-query' : 'tls://1.1.1.1',
        route: flow.outbound === 'direct' ? {source: 'dns.routing', rule: 'qname(geosite: cn) -> alidns'} : {source: 'default', rule: null},
        elapsed_ms: cached ? 0 : failed ? (i % 2 ? 5000 : 420) : i % 9 === 2 ? 140 + ((i * 13) % 260) : 6 + ((i * 7) % 48),
        answers: failed || missing || !dst ? [] : [{name, type, class: 'IN', ttl: 300, data: type === 'AAAA' ? '2001:db8::' + (i + 1).toString(16) : dst}]
      };
    });
}
type NetworkApi = Pick<
  Api,
  | 'connections'
  | 'flows'
  | 'flow'
  | 'routingTrace'
  | 'dnsCache'
  | 'dnsLog'
  | 'dnsQuery'
  | 'closeConnection'
  | 'closeConnections'
  | 'deleteDnsEntry'
  | 'flushDnsCache'
>;
export function createNetwork(
  capabilities: Capabilities,
  big: boolean,
  profile: string | null,
  outbounds: RuntimeOutbounds,
  revision: () => string,
  ruleSnapshot: () => Promise<RuleList>
) {
  const flowPage = createPager('flows');
  const cachePage = createPager('dnsCache');
  const logPage = createPager('dnsLog');
  const large = big ? fixtures.connectionFixtures() : undefined;
  const flows = large?.flows ?? structuredClone(fixtures.flows);
  const connections = large?.connections ?? structuredClone(fixtures.connections);
  // honk's first release observes userspace only; the mock says so the same way.
  if (profile === 'm1') connections.visibility = 'partial';
  const dnsCache = structuredClone(fixtures.dnsCache);
  // Ends a live connection the userspace datapath owns: the row, its outbound counter and its recorded flow.
  function closeLive(connection: (typeof connections.tcp)[number], reason: string) {
    if (connection.state === 'active') {
      const counter = outbounds.outbounds.find(row => row.name === connection.outbound);
      if (counter) counter.active_connections--;
    }
    connection.state = 'closed';
    connection.upload_bytes_per_second = connection.download_bytes_per_second = '0';
    const flow = flows.find(f => f.connection_id === connection.id);
    if (!flow) return;
    const observed_at = new Date().toISOString();
    const last = flow.trace.steps[flow.trace.steps.length - 1];
    flow.state = 'closed';
    flow.ended_at = observed_at;
    flow.revision++;
    flow.trace.steps.push({
      seq: (last?.seq ?? 0) + 1,
      observed_at,
      elapsed_us: Math.max(last?.elapsed_us ?? 0, (Date.now() - Date.parse(flow.started_at!)) * 1000),
      generation_id: revision(),
      evidence: 'observed',
      stage: 'connection',
      data: {state: 'closed', milestone: 'terminal', reason, attempt_id: null, reply_received: null, error: null}
    });
  }
  const api: NetworkApi = {
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
      const result = flowPage(
        flows.filter(
          f =>
            (!query?.network || query.network === 'all' || f.network === query.network) &&
            (!query?.state || query.state === 'all' || f.state === query.state) &&
            (query?.connection_id === undefined || f.connection_id === query.connection_id)
        ),
        query
      );
      return {
        instance_id: instanceId,
        observed_at: observedAt,
        coverage: {
          userspace_tcp: 'full',
          userspace_udp: 'full',
          kernel_direct: 'partial',
          kernel_block: 'partial',
          dns_intercept: 'partial',
          kernel_bypass: 'none'
        },
        dropped_records: big ? '0' : fixtures.flowDroppedRecords,
        flows: result.items.map(({trace, input, ...summary}) => (fixtures.flowSummaryOmitsInput[summary.id] ? summary : {...summary, input})),
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
      if (!capabilities.resources.routing_trace.available) throw new ApiError(404, 'capability_not_supported', 'Routing trace is unavailable');
      return routingTrace(request, await ruleSnapshot(), dnsCache);
    },
    dnsCache: async (query, signal) => {
      signal?.throwIfAborted();
      const name = query?.name ?? query?.domain;
      const entries = dnsCache.entries.filter(e => (!name || e.domain === name || e.domain === name + '.') && (!query?.type || query.type.includes(e.type)));
      const result = cachePage(entries, query);
      // Usage covers the whole cache, whatever the listing's filters.
      const usage = {entries: String(dnsCache.entries.length), entry_capacity: '100000'};
      return {...dnsCache, coverage: {...dnsCache.coverage}, entries: result.items, total: result.total, next_cursor: result.next_cursor, usage};
    },
    dnsLog: async (query, signal) => {
      signal?.throwIfAborted();
      const limits = capabilities.resources.dns_log;
      if (!limits.available) throw new ApiError(404, 'capability_not_supported', 'DNS log unavailable');
      if (query?.limit !== undefined && query.limit > limits.max_page_size!)
        throw new ApiError(400, 'invalid_request', 'limit exceeds the advertised page size');
      const needle = query?.name?.toLowerCase();
      const src = query?.src === undefined ? undefined : ipLiteral(query.src);
      const ring = dnsLogRecords(flows);
      const records = ring.filter(
        r =>
          (!needle || r.question.name.toLowerCase().includes(needle)) &&
          (!query?.type || r.question.type === query.type) &&
          (!src || (r.src !== null && sourceIp(r.src) === src))
      );
      const result = logPage(records, {...query, limit: query?.limit ?? 200});
      // total counts the ring before filters, as the contract defines it.
      return {observed_at: new Date().toISOString(), total: ring.length, next_cursor: result.next_cursor, records: result.items};
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
        closeLive(list[index], 'closed_by_request');
        list.splice(index, 1);
        return;
      }
      throw new ApiError(404, 'resource_not_found', 'Connection not found');
    },
    closeConnections: async (query, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.connections.can_close) throw new ApiError(404, 'capability_not_supported', 'Closing connections is unavailable');
      const src = query?.src === undefined ? undefined : ipLiteral(query.src);
      if (query?.src !== undefined && !src) throw new ApiError(400, 'invalid_request', 'Expected a source IP literal');
      const type = query?.type ?? 'all';
      if (type === 'all' && !src && !query?.all) throw new ApiError(400, 'invalid_request', 'An unfiltered close needs all=true');
      const lists: Array<'tcp' | 'udp'> = type === 'tcp' ? ['tcp'] : type === 'udp' ? ['udp'] : ['tcp', 'udp'];
      const selected = lists.flatMap(network => connections[network].filter(c => !src || sourceIp(c.src) === src).map(c => ({network, c})));
      const max = capabilities.resources.connections.max_bulk_close ?? 1000;
      if (selected.length > max) throw new ApiError(413, 'request_too_large', `More than ${max} connections match`);
      let closed = 0;
      let skipped = 0;
      for (const {network, c} of selected) {
        if (c.observed_by === 'ebpf') {
          skipped += 1;
          continue;
        }
        closeLive(c, 'closed_by_request');
        connections[network].splice(connections[network].indexOf(c), 1);
        closed += 1;
      }
      return {closed, skipped};
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
    }
  };
  function interrupt(groupId: string, network: 'tcp' | 'udp') {
    let interrupted = false;
    for (const connection of connections[network]) {
      if (connection.outbound !== groupId || !['active', 'dialing', 'routing'].includes(connection.state)) continue;
      interrupted = true;
      closeLive(connection, 'group_selection_changed');
    }
    return interrupted;
  }
  return {api, interrupt};
}
