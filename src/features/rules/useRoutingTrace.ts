import {useCallback, useState} from 'react';
import type {Key} from '../../i18n/messages';
import {getApi} from '../../api';
import type {RoutingTraceRequest, RoutingTraceResponse} from '../../api/model';
import {useAction} from '../../api/store/action';
import {useCapabilities} from '../../api/store/runtime';
import {routingTrace} from '../../api/store/flows';
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
  const [accepted, setResult] = useState<{response: RoutingTraceResponse; input: RoutingTraceRequest['input']} | null>(null);
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
  // DNS diagnostics supply query mode when the backend cannot resolve within a trace.
  const backendModes: TraceResolve[] = resource?.resolve_modes ?? [];
  const dnsQuery = capabilities.data?.resources.dns_query;
  const recordTypes = (dnsQuery?.record_types ?? []).filter(type => type === 'A' || type === 'AAAA');
  const modes: TraceResolve[] = [
    ...backendModes,
    ...(!backendModes.includes('live') && backendModes.includes('none') && dnsQuery?.available && recordTypes.length ? ['query' as const] : [])
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
    const response = await run('trace', signal => routingTrace(api, {input, resolve, recordTypes}, signal));
    if (response) setResult({response, input});
  }, [api, busy, canSubmit, form, resolve, recordTypes, run]);
  return {
    form,
    resolve,
    setForm,
    result: accepted?.response ?? null,
    input: accepted?.input,
    error: error ?? capabilities.error,
    busy: busy !== null,
    submit,
    invalid,
    available,
    modes
  };
}
