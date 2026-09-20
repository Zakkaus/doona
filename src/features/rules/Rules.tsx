import {useT, useLang, LOCALE, formatList} from '../../i18n';
import {localTime, outboundLabel, preferredHealth, word} from '../../api/selectors';
import {millis} from '../../api/u64';
import type {GroupSummary, Node} from '../../api/model';
import {useEffect, useMemo} from 'react';
import {useCapabilities, useGroups, useNodeProbe, useNodes, useRoutingTrace, type TraceResolve} from '../../api/store';
import {Button, DataTable, Disclosure, ErrorMessage, Loading, TextTooltip, Kv, LabeledSelect, Light, Tabs, TextField, errorText, toast} from '../../ui/ui';
import {RuleList} from './RuleList';
import {FlowRecords, RoutingMap} from '../flows/Flows';
import type {PageProps} from '../types';
import type {Key} from '../../i18n/messages';

// The member an outbound would use right now: the group's current selection for the network, followed through
// nested groups to a node. A built-in outbound has no chain.
function leafOf(outbound: string, network: 'tcp' | 'udp', groups: GroupSummary[], nodes: Node[]): {chain: string[]; node: Node | null} {
  const chain: string[] = [];
  let group = groups.find(g => g.name === outbound);
  while (group && chain.length < 8) {
    chain.push(group.name);
    const member = network === 'udp' ? group.selection.udp_member_id : group.selection.tcp_member_id;
    if (!member) return {chain, node: null};
    const next = groups.find(g => g.id === member);
    if (!next) return {chain, node: nodes.find(n => n.id === member) ?? null};
    group = next;
  }
  return {chain, node: null};
}

const resolveLabels: Record<TraceResolve, Key> = {none: 'rule.resolveNone', live: 'rule.resolveLive', query: 'rule.resolveQuery'};

const outcomes: Record<string, Key> = {
  matched: 'rule.result.matched',
  not_matched: 'rule.result.not_matched',
  skipped: 'rule.result.skipped',
  indeterminate: 'rule.result.indeterminate'
};

// Everything about routing decisions on one page: the rule list, the config drawn as a map, the retained flow
// records with their traces, and a simulator for a hypothetical input.
export function Rules({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const flows = resources?.flows.available !== false;
  const rules = resources?.rules.available === true;
  const tabs = [
    ...(flows ? [{id: 'map', label: t('rule.map'), content: <RoutingMap go={go} query={query} />}] : []),
    ...(flows || rules ? [{id: 'list', label: t('rule.listTitle'), content: <RuleList go={go} query={query} />}] : []),
    ...(flows ? [{id: 'flows', label: t('rule.flows'), content: <FlowRecords go={go} query={query} />}] : []),
    ...(resources?.routing_trace.available !== false ? [{id: 'trace', label: t('rule.trace'), content: <Trace />}] : [])
  ];
  const tab = tabs.some(item => item.id === params.get('tab')) ? params.get('tab')! : (tabs[0]?.id ?? 'map');
  if (capabilities.loading && !capabilities.data) return <Loading />;
  if (capabilities.error) return <ErrorMessage error={capabilities.error} />;
  return (
    <div className="rp-page">
      <Tabs
        label={t('nav.rules')}
        items={tabs}
        value={tab}
        onChange={next => {
          const nextParams = new URLSearchParams(query);
          nextParams.set('tab', next);
          go('rules', nextParams.toString());
        }}
      />
    </div>
  );
}

function Trace() {
  const t = useT();
  const lang = useLang();
  const trace = useRoutingTrace();
  // Engine words the flow pages translate read the same here; anything else stays as reported.
  const phrase = (value: ReturnType<typeof word>) => (typeof value === 'string' ? value : t(value.key, value.params));
  useEffect(() => {
    if (trace.error) toast('negative', errorText(trace.error));
  }, [trace.error]);
  const {form, setForm} = trace;
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const probe = useNodeProbe(nodes.refetch);
  // What the decision means today: the member the outbound resolves to and its last measured health.
  const leaf = (outbound: string | null) => {
    if (!outbound || outbound === 'direct' || outbound === 'block') return null;
    const {chain, node} = leafOf(outbound, form.network, groups.data ?? [], nodes.data ?? []);
    const health = node ? preferredHealth(node) : undefined;
    const reach = !node
      ? t('rule.noMember')
      : health?.state === 'healthy' && health.latency_ms != null
        ? t('ui.latency', {n: millis(health.latency_ms)})
        : health?.state === 'unavailable'
          ? t('ui.unavailable')
          : t('rule.untested');
    return {chain: [...chain, ...(node ? [node.name] : [])].join(' → '), node, reach};
  };
  return (
    <>
      <form
        className="rp-card"
        onSubmit={e => {
          e.preventDefault();
          void trace.submit();
        }}
      >
        <div className="rp-toolbar">
          <LabeledSelect
            label={t('ui.network')}
            value={form.network}
            onChange={network => setForm({...form, network: network as 'tcp' | 'udp'})}
            items={[
              {id: 'tcp', label: t('ui.tcp')},
              {id: 'udp', label: t('ui.udp')}
            ]}
          />
          <TextField label={t('ui.domain')} value={form.domain} onChange={domain => setForm({...form, domain})} />
          <TextField label={t('ui.destinationIp')} value={form.dst_ip} onChange={dst_ip => setForm({...form, dst_ip})} />
          <TextField label={t('rule.dstPort')} value={form.dst_port} onChange={dst_port => setForm({...form, dst_port})} />
          <LabeledSelect
            label={t('rule.resolve')}
            value={trace.resolve}
            onChange={resolve => setForm({...form, resolve: resolve as TraceResolve})}
            items={trace.modes.map(id => ({id, label: t(resolveLabels[id])}))}
          />
          <Button
            accent
            isPending={trace.busy}
            isDisabled={trace.busy || !!trace.invalid || !trace.available || !trace.modes.includes(trace.resolve)}
            type="submit"
          >
            {t('rule.run')}
          </Button>
        </div>
        <Disclosure id="rules-trace-advanced" title={t('rule.advanced')}>
          <div className="rp-toolbar">
            <TextField label={t('ui.sourceIp')} value={form.src_ip} onChange={src_ip => setForm({...form, src_ip})} />
            <TextField label={t('rule.srcPort')} value={form.src_port} onChange={src_port => setForm({...form, src_port})} />
            <TextField label={t('ui.process')} value={form.pname} onChange={pname => setForm({...form, pname})} />
          </div>
        </Disclosure>
        {trace.invalid && <span className="rp-label">{t(trace.invalid)}</span>}
        {!trace.invalid && form.dst_ip.trim() && !form.domain.trim() && <span className="rp-label">{t('rule.ipOnly')}</span>}
        {!trace.available && <span className="rp-label">{t('rule.unavailable')}</span>}
      </form>
      {trace.result && (
        <section className="rp-col" aria-label={t('rule.result')}>
          <div className="rp-toolbar">
            <TextTooltip text={t('rule.note')} className="rp-label">
              {t('ui.valuePair', {label: t('rule.observed'), value: localTime(trace.result.observed_at, LOCALE[lang])})} ·{' '}
              {t('ui.valuePair', {label: t('ui.generation'), value: trace.result.generation_id})}
            </TextTooltip>
          </div>
          {trace.result.evaluations.map((evaluation, i) => (
            <section className="rp-card" key={i}>
              <div className="rp-row">
                <h3 className="rp-h3">{evaluation.dst_ip ?? form.domain}</h3>
                <Kv
                  inline
                  items={[
                    [t('rule.decision'), t(evaluation.decision === 'determinate' ? 'rule.determinate' : 'rule.result.indeterminate')],
                    [t('ui.outbound'), outboundLabel(evaluation.outbound, t)],
                    ...(evaluation.missing_inputs.length ? [[t('rule.missing'), formatList(lang, evaluation.missing_inputs)] as [string, string]] : []),
                    ...(picked => (picked ? [[t('rule.node'), picked.chain] as [string, string], [t('rule.reach'), picked.reach] as [string, string]] : []))(
                      leaf(evaluation.outbound)
                    )
                  ]}
                />
                {(picked => {
                  const node = picked?.node;
                  return (
                    node &&
                    probe.canProbe &&
                    node.protocol !== 'direct' &&
                    node.protocol !== 'block' && (
                      <Button
                        small
                        isPending={probe.busy === node.id}
                        isDisabled={!!probe.busy}
                        onPress={() => {
                          void probe.probe(node.id).then(
                            result => {
                              if (!result) return;
                              const sample = result.results.find(item => item.member_id === node.id && item.state === 'healthy' && item.latency_ms != null);
                              toast(
                                sample ? 'positive' : 'negative',
                                sample ? t('nodes.probed', {name: node.name, n: millis(sample.latency_ms!)}) : t('nodes.probeFailed', {name: node.name})
                              );
                            },
                            error => toast('negative', errorText(error))
                          );
                        }}
                      >
                        {t('nodes.probe', {name: node.name})}
                      </Button>
                    )
                  );
                })(leaf(evaluation.outbound))}
              </div>
              <DataTable
                label={t('rule.evaluation', {n: i + 1})}
                height={360}
                rows={evaluation.rules.map(rule => ({...rule, id: rule.rule_id}))}
                cols={[
                  {id: 'expression', label: t('rule.expression'), minWidth: 240, grow: 2, isRowHeader: true},
                  {id: 'result', label: t('rule.outcome'), minWidth: 120, grow: 0},
                  {id: 'missing', label: t('rule.missing'), minWidth: 144}
                ]}
                render={rule => [
                  <TextTooltip className="rp-code" text={rule.rule_id}>
                    {rule.expression ?? rule.rule_id}
                  </TextTooltip>,
                  <Light
                    small
                    tone={rule.result === 'matched' ? 'ok' : rule.result === 'indeterminate' ? 'warn' : rule.result === 'skipped' ? 'muted' : 'neutral'}
                  >
                    {outcomes[rule.result] ? t(outcomes[rule.result]) : rule.result}
                  </Light>,
                  formatList(lang, rule.missing_inputs) || '—'
                ]}
              />
            </section>
          ))}
          {trace.result.dns.map(dns => (
            <section className="rp-card" key={dns.lookup_id}>
              <h3 className="rp-h3">DNS · {dns.name}</h3>
              <Kv
                inline
                items={[
                  [t('ui.type'), dns.qtype],
                  [t('ui.state'), dns.status],
                  [t('ui.source'), phrase(word(dns.source))],
                  [t('ui.cache'), phrase(word(dns.cache))],
                  [t('rule.address'), formatList(lang, dns.addresses) || '—'],
                  ...(dns.error ? [[t('ui.error'), dns.error] as [string, string]] : [])
                ]}
              />
            </section>
          ))}
        </section>
      )}
    </>
  );
}
