import {getApi} from '../api/index';
import {poll} from './cadence';
import type {Api} from '../api/api';
import type {DnsQueryResponse, FlowList, FlowQuery, RoutingTraceRequest, RoutingTraceResponse} from '../api/model';
import {clientError} from '../api/error';
import {simulatedAddress} from '../api/selectors';
import {gated, pageSize, useResource, walk} from './resource';
import {useCapabilities} from './runtime';

// A query-mode run is two things: a DNS query and one simulation per simulated address. They stay apart, so the
// page never presents the query's answer as DNS evidence of a trace.
export type RoutingTraceRun = {traces: RoutingTraceResponse[]; query: DnsQueryResponse | null};

export async function routingTrace(
  api: Api,
  {
    input,
    resolve,
    recordTypes
  }: Omit<RoutingTraceRequest, 'resolve'> & {
    resolve: RoutingTraceRequest['resolve'] | 'query';
    recordTypes: string[];
  },
  signal: AbortSignal
): Promise<RoutingTraceRun> {
  if (resolve !== 'query') return {traces: [await api.routingTrace({input, resolve}, signal)], query: null};
  const query = await api.dnsQuery(input.domain!, recordTypes, signal);
  const addresses = [
    ...new Set(
      ['A', 'AAAA'].flatMap(
        type =>
          query.results
            .filter(item => item.type === type)
            .map(simulatedAddress)
            .find(Boolean) ?? []
      )
    )
  ];
  const traces: RoutingTraceResponse[] = [];
  for (const address of addresses.length ? addresses : [null]) {
    traces.push(await api.routingTrace({input: address ? {...input, dst_ip: address} : input, resolve: 'none'}, signal));
  }
  if (traces.some(trace => trace.instance_id !== traces[0].instance_id || trace.generation_id !== traces[0].generation_id))
    throw clientError(409, 'snapshot_unavailable', 'The routing generation changed during simulation; retry the query', 'ui.errGenerationChanged');
  return {traces, query};
}

// The whole retained set, one snapshot per poll: a cursor is bound to a snapshot, so pages cannot be added to
// a list that the next poll replaces. Network and state narrow the walk on the backend instead.
export type FlowFilter = {connection_id?: string; network?: NonNullable<FlowQuery>['network']; state?: NonNullable<FlowQuery>['state']};
export function useFlows({connection_id, network = 'all', state = 'all'}: FlowFilter = {}, enabled = true) {
  const api = getApi();
  const {data: capabilities, error: capabilitiesError} = useCapabilities();
  const limit = pageSize(capabilities, capabilities?.resources.flows.max_page_size);
  return useResource(
    {
      key: ['flows', {connection_id, network, state, limit}],
      every: poll.lists,
      fetch: signal =>
        walk(
          cursor => api.flows({network, state, connection_id, cursor, limit, detail: 'full'}, signal),
          (acc: FlowList | undefined, page) => {
            if (!acc) return {...page, flows: [...page.flows]};
            acc.flows.push(...page.flows);
            return acc;
          }
        )
    },
    gated(capabilities, capabilitiesError, enabled)
  );
}

export function useFlow(id: string | null) {
  const api = getApi();
  return useResource(
    {
      key: ['flow', {id}],
      fetch: signal => (id ? api.flow(id, signal) : Promise.resolve(null)),
      acceptEvent: event => event.event !== 'flow.updated' || event.data.resource_id === id
    },
    {enabled: id !== null}
  );
}
export function useRules(enabled = true) {
  const api = getApi();
  return useResource({key: ['rules'], every: 0, fetch: signal => api.rules(signal)}, {enabled});
}
export function useDnsRules(enabled = true) {
  const api = getApi();
  return useResource({key: ['dnsRules'], every: 0, fetch: signal => api.dnsRules(signal)}, {enabled});
}
