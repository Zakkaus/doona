import {useCallback, useEffect, useEffectEvent, useMemo, useState} from 'react';
import {isBuiltinOutbound} from '../../dae/vocab';
import type {Key} from '../../i18n';
import {getApi} from '../../api';
import type {RoutingTraceRequest} from '../../api/model';
import {useAction} from '../../store/action';
import {useCapabilities} from '../../store/runtime';
import {routingTrace, type RoutingTraceRun} from '../../store/flows';
import {queryTypes, useGroups, useNodeProbe, useNodes, useProviders, useRules} from '../../store';
import {ipLiteral, resolveSelectedLeaf} from '../../api/selectors';
import {useLang, useT} from '../../i18n';
import {toast, toastErrorDetail, toastFailure} from '../../ui/ui';
import {chainLinks, dnsView, evaluationView, nameLinks, queryView, traceReason, traceSeed, traceStatusView} from './view';
import {probeFallbackNotice, probeToast} from '../shared/probe';
import {offered} from '../../api/capabilities';
import type {PageProps} from '../../shell/routes';
import {useQuickRule} from '../shared/useQuickRule';
import {ruleHref} from '../shared/link';
import {traceInput} from './traceInput';
import type {TraceForm, TraceResolve} from './useTraceForm';
const isPort = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
const isDscp = (value: string) => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 63;
type TraceProblem = {field: 'domain' | 'dst_ip' | 'dst_port' | 'src_ip' | 'src_port' | 'dscp'; key: Key};
const resolveLabels: Record<TraceResolve, Key> = {none: 'rule.resolveNone', live: 'rule.resolveLive', query: 'rule.resolveQuery'};
export function useRoutingTrace({form, setForm, advanced, setAdvanced, touched}: TraceForm, go: PageProps['go']) {
  const t = useT();
  const lang = useLang();
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  const rules = useRules(offered(resources, 'rules', {whileLoading: false}));
  const probe = useNodeProbe(nodes.refetch);
  const {choices: probeChoices} = probe;
  const quick = useQuickRule(go);
  const groupsByName = useMemo(() => new Map(groups.data?.map(group => [group.name, group]) ?? []), [groups.data]);
  const groupsById = useMemo(() => new Map(groups.data?.map(group => [group.id, group]) ?? []), [groups.data]);
  const nodesById = useMemo(() => new Map(nodes.data?.map(node => [node.id, node]) ?? []), [nodes.data]);
  const rulesById = useMemo(() => new Map(rules.data?.rules.map(rule => [rule.rule_id, rule]) ?? []), [rules.data]);
  const [accepted, setResult] = useState<{run: RoutingTraceRun; input: RoutingTraceRequest['input']} | null>(null);
  // A result's node opens under the owner the Nodes page files it under, which the provider list decides.
  const providersListed = offered(resources, 'providers', {whileLoading: false});
  const providers = useProviders(!!accepted && providersListed);
  const groupsListed = offered(resources, 'groups', {whileLoading: false});
  const {busy, error, run} = useAction<'trace'>();
  const problem = error ?? capabilities.error;
  const report = useEffectEvent((error: Error) => toast('negative', t('rule.traceFailed'), toastErrorDetail(error, t)));
  useEffect(() => {
    if (problem) report(problem);
  }, [problem]);
  const invalid: TraceProblem | null =
    !form.domain.trim() && !form.dst_ip.trim()
      ? {field: 'domain', key: 'rule.invalidTarget'}
      : form.dst_ip.trim() && !ipLiteral(form.dst_ip)
        ? {field: 'dst_ip', key: 'ui.invalidIp'}
        : !isPort(form.dst_port)
          ? {field: 'dst_port', key: 'rule.invalidPort'}
          : form.src_ip.trim() && !ipLiteral(form.src_ip)
            ? {field: 'src_ip', key: 'ui.invalidIp'}
            : form.src_port.trim() && !isPort(form.src_port)
              ? {field: 'src_port', key: 'rule.invalidPort'}
              : form.dscp.trim() && !isDscp(form.dscp)
                ? {field: 'dscp', key: 'rule.invalidDscp'}
                : (form.resolve === 'live' || form.resolve === 'query') && !form.domain.trim()
                  ? {field: 'domain', key: 'rule.invalidLive'}
                  : (form.resolve === 'live' || form.resolve === 'query') && form.dst_ip.trim()
                    ? {field: 'dst_ip', key: 'rule.invalidLive'}
                    : null;
  const shown = touched ? invalid : null;
  const resource = capabilities.data?.resources.routing_trace;
  // DNS diagnostics supply query mode when the backend cannot resolve within a trace.
  const backendModes: TraceResolve[] = resource?.resolve_modes ?? [];
  const dnsQuery = capabilities.data?.resources.dns_query;
  const recordTypesOffered = dnsQuery?.record_types;
  const recordTypes = useMemo(() => (recordTypesOffered ?? []).filter(type => type === 'A' || type === 'AAAA'), [recordTypesOffered]);
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
    const input = traceInput(form);
    const traced = await run('trace', signal =>
      routingTrace(
        {
          ...api,
          dnsQuery: (domain, types) => queryTypes(api.dnsQuery, domain, types, maxTypes, signal)
        },
        {input, resolve, recordTypes},
        signal
      )
    );
    // The previous result stays up while a rerun is pending; a failed rerun clears it so it does not look current.
    setResult(traced ? {run: traced, input} : null);
  }, [api, busy, canSubmit, form, resolve, recordTypes, maxTypes, run]);
  const generation = rules.data?.generation_id;
  const evaluations = useMemo(
    () =>
      accepted?.run.traces
        // Rule ids name rules within one generation, so only a trace from the listed generation joins the rule list.
        .flatMap(trace => trace.evaluations.map(evaluation => ({evaluation, traced: trace.generation_id, current: generation === trace.generation_id})))
        .map(({evaluation, traced, current}, index) => {
          const matched = evaluation.rules.find(rule => rule.result === 'matched');
          const likely =
            evaluation.decision !== 'determinate' && !evaluation.outbound && current ? ((matched && rulesById.get(matched.rule_id)?.outbound) ?? null) : null;
          const outbound = evaluation.outbound ?? likely;
          const selected =
            outbound && !isBuiltinOutbound(outbound) ? resolveSelectedLeaf(outbound, accepted.input.network, groupsByName, groupsById, nodesById) : null;
          const view = evaluationView(
            evaluation,
            index,
            accepted.input.domain ?? undefined,
            likely,
            selected,
            !!selected?.node && probeChoices(selected.node).length > 0,
            probe.busy,
            t,
            lang
          );
          return {
            ...view,
            rows: view.rows.map(row => ({...row, href: ruleHref(row.id, current && rulesById.has(row.id))})),
            links: chainLinks(selected, groupsListed, providersListed ? providers.data?.providers : [], t),
            seed: traceSeed(accepted.input, evaluation, traced)
          };
        }) ?? [],
    [accepted, generation, rulesById, groupsByName, groupsById, nodesById, groupsListed, providersListed, providers.data, probeChoices, probe.busy, t, lang]
  );
  const result = useMemo(
    () =>
      accepted
        ? {
            status: traceStatusView(accepted.run.traces[0], accepted.run.query, t, lang),
            query: accepted.run.query && {...queryView(accepted.run.query, t, lang), links: nameLinks(accepted.run.query.domain, resources, t)},
            dns: accepted.run.traces.flatMap(trace => trace.dns).map(dns => ({...dnsView(dns, t, lang), links: nameLinks(dns.name, resources, t)}))
          }
        : null,
    [accepted, resources, t, lang]
  );
  const probeNode = async (id: string) => {
    const node = nodesById.get(id);
    if (!node) return;
    try {
      const result = await probe.probe(node);
      if (!result) return;
      const {kind, text} = probeToast(result, id, node.name, t);
      toast(kind, text + probeFallbackNotice(result.fallback, node.name, t));
    } catch (error) {
      toastFailure(error, t, t('nodes.probeError', {name: node.name}));
    }
  };
  return {
    form,
    resolve,
    setForm,
    busy: busy !== null,
    canSubmit: !busy && canSubmit,
    reason: traceReason({loaded: !!capabilities.data, busy: busy !== null, available, invalid: invalid?.key ?? null, modeOffered: modes.includes(resolve)}, t),
    submit,
    modes: modes.map(id => ({id, label: t(resolveLabels[id])})),
    // An untouched form is not wrong yet; submit stays disabled until it is complete.
    errors: {
      domain: shown?.field === 'domain' ? t(shown.key) : undefined,
      dst_ip: shown?.field === 'dst_ip' ? t(shown.key) : undefined,
      dst_port: shown?.field === 'dst_port' ? t(shown.key) : undefined,
      src_ip: shown?.field === 'src_ip' ? t(shown.key) : undefined,
      src_port: shown?.field === 'src_port' ? t(shown.key) : undefined,
      dscp: shown?.field === 'dscp' ? t(shown.key) : undefined
    },
    advanced: advanced || invalid?.field === 'src_ip' || invalid?.field === 'src_port' || invalid?.field === 'dscp',
    setAdvanced,
    ipOnly: !invalid && !!form.dst_ip.trim() && !form.domain.trim(),
    result: result && {...result, evaluations: evaluations.map(({seed, ...evaluation}) => ({...evaluation, canAdd: quick.canAdd(seed)}))},
    probeNode,
    addRule: (index: number) => {
      const seed = evaluations[index]?.seed;
      if (seed) quick.open(seed);
    },
    ruleDialog: quick.dialog
  };
}
