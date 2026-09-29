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
import {isPort} from '../../dae/setup';
import {useLang, useT} from '../../i18n';
import {toast, toastFailure, useLinked} from '../../ui/ui';
import {chainLinks, dnsView, evaluationView, nameLinks, queryView, traceReason, traceSeed, traceStatusView} from './view';
import {probeToast} from '../shared/probe';
import {errorText} from '../../api/error';
import {offered} from '../../api/capabilities';
import type {PageProps} from '../../shell/routes';
import {useQuickRule} from '../shared/useQuickRule';
import {parseTraceLink, ruleHref} from '../shared/link';
type TraceProblem = {field: 'domain' | 'dst_ip' | 'dst_port' | 'src_ip' | 'src_port'; key: Key};
export type TraceResolve = 'none' | 'live' | 'query';
const resolveLabels: Record<TraceResolve, Key> = {none: 'rule.resolveNone', live: 'rule.resolveLive', query: 'rule.resolveQuery'};
const blankForm = {
  network: 'tcp' as 'tcp' | 'udp',
  domain: '',
  dst_ip: '',
  dst_port: '',
  src_ip: '',
  src_port: '',
  pname: '',
  // Null until the backend says what it offers: live when it can resolve, else none.
  resolve: null as TraceResolve | null
};
// Held by the rules page rather than the trace tab, so what was typed survives a tab switch. A link that names a
// target fills the form in, opening the advanced fields when it names the source; it does not run the trace.
export function useTraceForm(query: string) {
  const linked = useMemo(() => parseTraceLink(query), [query]);
  const [form, setForm] = useState(() => (linked ? {...blankForm, ...linked} : blankForm));
  const [advanced, setAdvanced] = useState(!!linked?.src_ip);
  useLinked(linked && JSON.stringify(linked), () => {
    if (!linked) return;
    setForm({...blankForm, ...linked});
    setAdvanced(!!linked.src_ip);
  });
  return {form, setForm, advanced, setAdvanced};
}
export function useRoutingTrace({form, setForm, advanced, setAdvanced}: ReturnType<typeof useTraceForm>, go: PageProps['go']) {
  const t = useT();
  const lang = useLang();
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  const rules = useRules(offered(resources, 'rules', {whileLoading: false}));
  const probe = useNodeProbe(nodes.refetch);
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
  const report = useEffectEvent((error: Error) => toast('negative', t('rule.traceFailed'), {detail: errorText(error, t)}));
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
              : (form.resolve === 'live' || form.resolve === 'query') && !form.domain.trim()
                ? {field: 'domain', key: 'rule.invalidLive'}
                : (form.resolve === 'live' || form.resolve === 'query') && form.dst_ip.trim()
                  ? {field: 'dst_ip', key: 'rule.invalidLive'}
                  : null;
  const touched = (Object.keys(blankForm) as Array<keyof typeof blankForm>).some(key => key !== 'resolve' && key !== 'network' && form[key] !== blankForm[key]);
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
    // `invalid` has already refused anything that is not an IP literal.
    const address = (value: string) => ipLiteral(value)!;
    // One of the two targets is always present; the address rides along with a domain when both are given.
    const input: RoutingTraceRequest['input'] = {
      network: form.network,
      dst_port: Number(form.dst_port),
      ...(form.domain.trim() ? {domain: form.domain.trim()} : {dst_ip: address(form.dst_ip)})
    };
    if (form.domain.trim() && form.dst_ip.trim()) input.dst_ip = address(form.dst_ip);
    if (form.src_ip.trim()) input.src_ip = address(form.src_ip);
    if (form.src_port.trim()) input.src_port = Number(form.src_port);
    if (form.pname.trim()) input.pname = form.pname.trim();
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
        .flatMap(trace => trace.evaluations.map(evaluation => ({evaluation, current: generation === trace.generation_id})))
        .map(({evaluation, current}, index) => {
          const matched = evaluation.rules.find(rule => rule.result === 'matched');
          const likely =
            evaluation.decision !== 'determinate' && !evaluation.outbound && current ? ((matched && rulesById.get(matched.rule_id)?.outbound) ?? null) : null;
          const outbound = evaluation.outbound ?? likely;
          const selected =
            outbound && !isBuiltinOutbound(outbound) ? resolveSelectedLeaf(outbound, accepted.input.network, groupsByName, groupsById, nodesById) : null;
          const view = evaluationView(evaluation, index, accepted.input.domain ?? undefined, likely, selected, probe.canProbe, probe.busy, t, lang);
          return {
            ...view,
            rows: view.rows.map(row => ({...row, href: ruleHref(row.id, current && rulesById.has(row.id))})),
            links: chainLinks(selected, groupsListed, providersListed ? providers.data?.providers : [], t),
            seed: traceSeed(accepted.input, evaluation)
          };
        }) ?? [],
    [accepted, generation, rulesById, groupsByName, groupsById, nodesById, groupsListed, providers.data, probe.canProbe, probe.busy, t, lang]
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
      const result = await probe.probe(id);
      if (!result) return;
      const {kind, text} = probeToast(result, id, node.name, t);
      toast(kind, text);
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
    available,
    modes: modes.map(id => ({id, label: t(resolveLabels[id])})),
    // An untouched form is not wrong yet; submit stays disabled until it is complete.
    errors: {
      domain: shown?.field === 'domain' ? t(shown.key) : undefined,
      dst_ip: shown?.field === 'dst_ip' ? t(shown.key) : undefined,
      dst_port: shown?.field === 'dst_port' ? t(shown.key) : undefined,
      src_ip: shown?.field === 'src_ip' ? t(shown.key) : undefined,
      src_port: shown?.field === 'src_port' ? t(shown.key) : undefined
    },
    advanced: advanced || invalid?.field === 'src_ip' || invalid?.field === 'src_port',
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
