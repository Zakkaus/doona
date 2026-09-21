import {useCallback, useEffect, useMemo, useState} from 'react';
import type {Key} from '../../i18n/messages';
import {getApi} from '../../api';
import type {RoutingTraceRequest, RoutingTraceResponse} from '../../api/model';
import {useAction} from '../../api/store/action';
import {useCapabilities} from '../../api/store/runtime';
import {routingTrace} from '../../api/store/flows';
import {useGroups, useNodeProbe, useNodes, useRules} from '../../api/store';
import {resolveSelectedLeaf} from '../../api/selectors';
import {millis} from '../../api/u64';
import {useLang, useT} from '../../i18n';
import {errorText, toast} from '../../ui/ui';
import {dnsView, evaluationView, traceStatusView} from './view';
import {queryTypes} from '../dns/query';
export type TraceProblem = {field: 'domain' | 'dst_ip' | 'dst_port' | 'src_port'; key: Key};
export type TraceResolve = 'none' | 'live' | 'query';
const resolveLabels: Record<TraceResolve, Key> = {none: 'rule.resolveNone', live: 'rule.resolveLive', query: 'rule.resolveQuery'};
export function useRoutingTrace() {
  const t = useT();
  const lang = useLang();
  const [advanced, setAdvanced] = useState(false);
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const rules = useRules(resources?.rules.available === true);
  const probe = useNodeProbe(nodes.refetch);
  const groupsByName = useMemo(() => new Map(groups.data?.map(group => [group.name, group]) ?? []), [groups.data]);
  const groupsById = useMemo(() => new Map(groups.data?.map(group => [group.id, group]) ?? []), [groups.data]);
  const nodesById = useMemo(() => new Map(nodes.data?.map(node => [node.id, node]) ?? []), [nodes.data]);
  const rulesById = useMemo(() => new Map(rules.data?.rules.map(rule => [rule.rule_id, rule]) ?? []), [rules.data]);
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
  const problem = error ?? capabilities.error;
  useEffect(() => {
    if (problem) toast('negative', errorText(problem));
  }, [problem]);
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
  const maxTypes = dnsQuery?.limits?.max_types_per_request ?? 1;
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
    const response = await run('trace', signal =>
      routingTrace(
        {
          ...api,
          dnsQuery: (domain, types) => queryTypes(api.dnsQuery, domain, types, maxTypes, signal)
        },
        {input, resolve, recordTypes},
        signal
      )
    );
    if (response) setResult({response, input});
  }, [api, busy, canSubmit, form, resolve, recordTypes, maxTypes, run]);
  const evaluations =
    accepted?.response.evaluations.map((evaluation, index) => {
      const matched = evaluation.rules.find(rule => rule.result === 'matched');
      const likely =
        evaluation.decision !== 'determinate' && !evaluation.outbound && rules.data?.generation_id === accepted.response.generation_id
          ? ((matched && rulesById.get(matched.rule_id)?.outbound) ?? null)
          : null;
      const outbound = evaluation.outbound ?? likely;
      const selected =
        outbound && outbound !== 'direct' && outbound !== 'block'
          ? resolveSelectedLeaf(outbound, accepted.input.network, groupsByName, groupsById, nodesById)
          : null;
      return evaluationView(evaluation, index, accepted.input.domain ?? undefined, likely, selected, probe.canProbe, probe.busy, t, lang);
    }) ?? [];
  const probeNode = async (id: string) => {
    const node = nodesById.get(id);
    if (!node) return;
    try {
      const result = await probe.probe(id);
      if (!result) return;
      const sample = result.results.find(item => item.member_id === id && item.state === 'healthy' && item.latency_ms != null);
      toast(
        sample ? 'positive' : 'negative',
        sample ? t('nodes.probed', {name: node.name, n: millis(sample.latency_ms!)}) : t('nodes.probeFailed', {name: node.name})
      );
    } catch (error) {
      toast('negative', errorText(error));
    }
  };
  return {
    form,
    resolve,
    setForm,
    busy: busy !== null,
    canSubmit: !busy && canSubmit,
    submit,
    available,
    modes: modes.map(id => ({id, label: t(resolveLabels[id])})),
    errors: {
      domain: invalid?.field === 'domain' ? t(invalid.key) : undefined,
      dst_ip: invalid?.field === 'dst_ip' ? t(invalid.key) : undefined,
      dst_port: invalid?.field === 'dst_port' ? t(invalid.key) : undefined,
      src_port: invalid?.field === 'src_port' ? t(invalid.key) : undefined
    },
    advanced: advanced || invalid?.field === 'src_port',
    setAdvanced,
    ipOnly: !invalid && !!form.dst_ip.trim() && !form.domain.trim(),
    result: accepted ? {status: traceStatusView(accepted.response, t, lang), evaluations, dns: accepted.response.dns.map(dns => dnsView(dns, t, lang))} : null,
    probeNode
  };
}
