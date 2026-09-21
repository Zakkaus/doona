import {useCallback, useState} from 'react';
import type {Key} from '../../i18n/messages';
import {getApi} from '../index';
import type {FlowList, RoutingTraceRequest, RoutingTraceResponse} from '../model';
import {pageSize, useResource, walk} from './resource';
import {useAction} from './action';
import {useCapabilities} from './runtime';
export type TraceProblem = {field: 'domain' | 'dst_ip' | 'dst_port' | 'src_port'; key: Key};
export type TraceResolve = 'none' | 'live' | 'query';
export function useRoutingTrace() {
  const api = getApi();
  const capabilities = useCapabilities();
  const [form, setForm] = useState({
    network: 'tcp' as 'tcp' | 'udp',
    domain: 'api.telegram.org',
    dst_ip: '',
    dst_port: '443',
    src_ip: '',
    src_port: '',
    pname: '',
    // Null until the backend says what it offers: live when it can resolve, else none.
    resolve: null as TraceResolve | null
  });
  const [result, setResult] = useState<RoutingTraceResponse | null>(null);
  const {busy, error, run} = useAction<'trace'>();
  const portValid = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
  const invalid: TraceProblem | null =
    !form.domain.trim() && !form.dst_ip.trim()
      ? {field: 'domain', key: 'rule.invalidTarget'}
      : !portValid(form.dst_port)
        ? {field: 'dst_port', key: 'rule.invalidPort'}
        : form.src_port.trim() && !portValid(form.src_port)
          ? {field: 'src_port', key: 'rule.invalidPort'}
          : (form.resolve === 'live' || form.resolve === 'query') && !form.domain.trim()
            ? {field: 'domain', key: 'rule.invalidLive'}
            : (form.resolve === 'live' || form.resolve === 'query') && form.dst_ip.trim()
              ? {field: 'dst_ip', key: 'rule.invalidLive'}
              : null;
  const resource = capabilities.data?.resources.routing_trace;
  // honk simulates without resolving; when it also answers DNS diagnostics, doona resolves the name through
  // `/dns/query` and simulates each address itself, the `query` mode.
  const backendModes: TraceResolve[] = resource?.resolve_modes ?? ['none', 'live'];
  const modes: TraceResolve[] = [
    ...backendModes,
    ...(backendModes.includes('live') || capabilities.data?.resources.dns_query.available !== true ? [] : ['query' as const])
  ];
  const available = resource?.available !== false;
  const named = form.domain.trim() !== '' && !form.dst_ip.trim();
  const resolve: TraceResolve = form.resolve ?? (named && modes.includes('live') ? 'live' : named && modes.includes('query') ? 'query' : 'none');
  const canSubmit = !invalid && available && modes.includes(resolve);
  const submit = useCallback(async () => {
    if (busy || !canSubmit) return;
    setResult(null);
    const input: RoutingTraceRequest['input'] = {
      network: form.network,
      dst_port: Number(form.dst_port),
      ...(form.domain.trim() ? {domain: form.domain.trim()} : {dst_ip: form.dst_ip.trim().replace(/^\[|\]$/g, '')})
    };
    if (form.dst_ip.trim()) input.dst_ip = form.dst_ip.trim().replace(/^\[|\]$/g, '');
    if (form.src_ip.trim()) input.src_ip = form.src_ip.trim().replace(/^\[|\]$/g, '');
    if (form.src_port.trim()) input.src_port = Number(form.src_port);
    if (form.pname.trim()) input.pname = form.pname.trim();
    const response = await run('trace', async signal => {
      if (resolve !== 'query') return api.routingTrace({input, resolve}, signal);
      // The name resolved through the engine's own DNS, then one simulation per address family; the answers are
      // reported the way a backend resolution would be, so the page reads them alike.
      const lookup = await api.dnsQuery(input.domain!, ['A', 'AAAA'], signal);
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
        (addresses.length ? addresses : [null]).map(address =>
          api.routingTrace({input: address ? {...input, dst_ip: address} : input, resolve: 'none'}, signal)
        )
      );
      return {...traces[0], evaluations: traces.flatMap(trace => trace.evaluations), dns};
    });
    if (response) setResult(response);
  }, [api, busy, canSubmit, form, resolve, run]);
  return {form, resolve, setForm, result, error: error ?? capabilities.error, busy: busy !== null, submit, invalid, available, modes};
}

export function useFlows(connection_id?: string, enabled = true) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const limit = pageSize(capabilities, capabilities?.resources.flows.max_page_size);
  return useResource(
    {
      key: ['flows', {connection_id}],
      fetch: signal =>
        walk(
          cursor => api.flows({network: 'all', state: 'all', connection_id, cursor, limit, detail: 'full'}, signal),
          (acc: FlowList | undefined, page) => (acc ? {...acc, flows: [...acc.flows, ...page.flows]} : page)
        )
    },
    // Every list request opens a bounded snapshot on the backend (honk keeps eight for 30 s), so this polls at
    // a third of the usual cadence; events still refetch it the moment a flow changes.
    {deps: [api, connection_id, limit], enabled, every: 15000}
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
    {deps: [api, id]}
  );
}
export function useRules(enabled = true) {
  const api = getApi();
  return useResource({key: ['rules'], fetch: signal => api.rules(signal)}, {deps: [api], enabled, every: 0});
}
