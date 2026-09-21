import {getApi} from '../index';
import type {Api} from '../api';
import type {FlowList, RoutingTraceRequest, RoutingTraceResponse} from '../model';
import {pageSize, useResource, walk} from './resource';
import {useCapabilities} from './runtime';

export async function routingTrace(
  api: Api,
  {input, resolve, recordTypes}: Omit<RoutingTraceRequest, 'resolve'> & {resolve: RoutingTraceRequest['resolve'] | 'query'; recordTypes: string[]},
  signal: AbortSignal
): Promise<RoutingTraceResponse> {
  if (resolve !== 'query') return api.routingTrace({input, resolve}, signal);
  const lookup = await api.dnsQuery(input.domain!, recordTypes, signal);
  const dns: RoutingTraceResponse['dns'] = lookup.results.map(item => ({
    lookup_id: `query:${item.type}`,
    parent_lookup_id: null,
    attempt_id: null,
    purpose: 'dial_target',
    name: lookup.domain,
    qtype: item.type,
    source: item.cached ? 'cache' : 'upstream',
    upstream_transport: null,
    carrier_transport: null,
    cache: item.cached ? 'hit' : 'miss',
    cache_entry_id: item.cache_entry_id,
    upstream: item.upstream,
    route_evaluation_ids: [],
    status: item.status,
    addresses: (item.answers ?? []).filter(answer => answer.type === item.type).map(answer => answer.data),
    selected_ip: (item.answers ?? []).find(answer => answer.type === item.type)?.data ?? null,
    error: null
  }));
  const addresses = dns.flatMap(item => item.addresses.slice(0, 1));
  const traces = await Promise.all(
    (addresses.length ? addresses : [null]).map(address => api.routingTrace({input: address ? {...input, dst_ip: address} : input, resolve: 'none'}, signal))
  );
  return {...traces[0], evaluations: traces.flatMap(trace => trace.evaluations), dns};
}

export function useFlows(connection_id?: string, enabled = true) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const limit = pageSize(capabilities, capabilities?.resources.flows.max_page_size);
  return useResource(
    {
      key: ['flows', {connection_id, limit}],
      every: 15000,
      fetch: signal =>
        walk(
          cursor => api.flows({network: 'all', state: 'all', connection_id, cursor, limit, detail: 'full'}, signal),
          (acc: FlowList | undefined, page) => {
            if (!acc) return {...page, flows: [...page.flows]};
            acc.flows.push(...page.flows);
            return acc;
          }
        )
    },
    {enabled}
  );
}

export function useFlow(id: string | null) {
  const api = getApi();
  return useResource({
    key: ['flow', {id}],
    fetch: signal => (id ? api.flow(id, signal) : Promise.resolve(null)),
    acceptEvent: event => event.event !== 'flow.updated' || event.data.resource_id === id
  });
}
export function useRules(enabled = true) {
  const api = getApi();
  return useResource({key: ['rules'], every: 0, fetch: signal => api.rules(signal)}, {enabled});
}
