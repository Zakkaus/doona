import type {Capabilities, ConfigSource, FlowList, GroupSummary, Node, RoutingEvaluation, RoutingRule, RoutingTraceResponse, RuleSource} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {isBuiltinOutbound} from '../../dae/vocab';
import {formatList, formatNumber, LOCALE, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import {isFragment, scanConfig} from '../../dae/text';
import {localTime, formatLatency} from '../../i18n/format';
import {outboundLabel, preferredHealth} from '../../api/selectors';
import {conditionKinds, type ConditionKind} from '../../dae/groups';
import {fileName} from '../../dae/sources';
import {coverageView, type CoverageView} from './flows/view';
import {word} from '../../api/labels';
import {ruleAnchor, ruleOutbounds, sourceFor} from '../../dae/ruleText';
import {ruleDistribution} from './distribution';
import {pickTab, within} from '../../shell/route';
import {rulesTabs, type RuleTab} from './nav';

const kindLabels: Record<ConditionKind, Key> = {
  domainSuffix: 'rule.kind.domainSuffix',
  domain: 'rule.kind.domain',
  geosite: 'rule.kind.geosite',
  dip: 'rule.kind.dip',
  geoip: 'rule.kind.geoip',
  sip: 'rule.kind.sip',
  dport: 'rule.kind.dport',
  sport: 'rule.kind.sport',
  pname: 'rule.kind.pname',
  l4proto: 'rule.kind.l4proto'
};
const kindHints: Record<ConditionKind, string> = {
  domainSuffix: 'example.com, example.org',
  domain: 'www.example.com',
  geosite: 'netflix, cn',
  dip: '10.0.0.0/8, 224.0.0.0/4',
  geoip: 'cn, private',
  sip: '192.168.1.10',
  dport: '80, 443',
  sport: '53',
  pname: 'curl, firefox',
  l4proto: 'udp'
};
const sources: Record<string, Key> = {kernel: 'rule.sourceKernel', recomputed: 'rule.sourceRecomputed', unknown: 'rule.sourceUnknown'};
type Choice = {id: string; label: string; desc?: string};
type DictionaryRow = {
  id: string;
  number: string;
  expression: string;
  outbound: string;
  must: boolean;
  position: string;
  hits: string;
  removable: boolean;
  sourceQuery: string | null;
};
export type DictionaryView = {rows: DictionaryRow[]; caption: string | null; positions: Choice[]; outbounds: Choice[]};
// The file a rule came from, by the name the configuration page uses; a redacted path shows nothing.
function sourceLabel(source: RuleSource, linked: ConfigSource | undefined): string {
  return linked ? fileName(linked) : source.file === '<redacted>' ? '' : source.file;
}
export function dictionaryView(
  rules: RoutingRule[],
  generation: string | undefined,
  flows: FlowList | undefined,
  config: ConfigSource[],
  groups: GroupSummary[],
  t: Translator,
  lang: Lang
): DictionaryView {
  const locale = LOCALE[lang];
  const current = new Map(rules.map(rule => [rule.rule_id, rule.expression]));
  const hits = new Map<string, number>();
  for (const row of ruleDistribution(flows?.flows ?? [])) {
    if (row.id !== null && current.get(row.id) === row.expression) hits.set(row.id, (hits.get(row.id) ?? 0) + row.count);
  }
  const byId = new Map(config.map(source => [source.id, source]));
  const resolve = (source: RuleSource | null | undefined) => {
    if (!source) return undefined;
    return byId.get(source.source_id);
  };
  // Only a rule doona can locate in its source is offered for removal or as an insertion point.
  const scans = new Map<string, ReturnType<typeof scanConfig>>();
  const anchored = (rule: RoutingRule) => {
    const source = rule.source && byId.get(rule.source.source_id);
    if (!source?.writable || source.content === undefined) return false;
    if (!scans.has(source.id)) scans.set(source.id, scanConfig(source.content));
    return ruleAnchor(source, rule, scans.get(source.id)) !== null;
  };
  const rows = rules.map(rule => {
    const linked = resolve(rule.source);
    const label = rule.source ? sourceLabel(rule.source, linked) : '';
    return {
      id: rule.rule_id,
      number: rule.kind === 'fallback' ? '—' : formatNumber(rule.index + 1, locale),
      expression: rule.expression,
      outbound: rule.outbound ?? '',
      must: rule.must,
      position: rule.source ? (label ? `${label}:${rule.source.line}` : t('rule.lineOnly', {n: rule.source.line})) : '—',
      hits: hits.has(rule.rule_id) ? formatNumber(hits.get(rule.rule_id)!, locale) : '—',
      removable: rule.kind === 'rule' && anchored(rule),
      sourceQuery: linked && rule.source ? within('', {tab: 'source', source: linked.id, line: String(rule.source.line)}) : null
    };
  });
  const fallback = rules.find(rule => rule.kind === 'fallback');
  return {
    rows,
    caption: generation !== undefined ? t('rule.dictionaryCaption', {n: rules.length, generation}) : null,
    positions: [
      ...(fallback && anchored(fallback) ? [{id: 'end', label: t('rule.positionEnd')}] : []),
      ...rules
        .filter((_, i) => rows[i].removable)
        .map(rule => ({id: rule.rule_id, label: t('rule.positionBefore', {n: rule.index + 1}), desc: rule.expression}))
    ],
    outbounds: ruleOutbounds(groups)
  };
}
type DistributionRow = {
  id: string;
  ruleId: string;
  expression: string;
  expressionClass: string | undefined;
  source: string;
  hits: string;
  share: string;
};
export type DistributionView = {
  rows: DistributionRow[];
  choices: [string, string][];
  caption: string | null;
  coverage: CoverageView | null;
  droppedUnknown: boolean;
};
export function distributionView(list: FlowList | undefined, source: string, t: Translator, lang: Lang): DistributionView {
  const locale = LOCALE[lang];
  // Keyed by what the row counts, so a row keeps its identity when a poll reorders the counts.
  const rows = ruleDistribution(list?.flows ?? [])
    .map(row => ({...row, key: JSON.stringify([row.id, row.expression, row.source])}))
    .sort(
      (a, b) =>
        (a.id === null || b.id === null ? Number(a.id === null) - Number(b.id === null) : a.id.localeCompare(b.id, undefined, {numeric: true})) ||
        b.count - a.count
    );
  return {
    rows: rows
      .filter(row => source === 'all' || row.source === source)
      .map(row => ({
        id: row.key,
        ruleId: row.id ?? '—',
        expression: row.expression ?? t('rule.unknownRule'),
        expressionClass: row.expression ? 'rp-code' : undefined,
        source: enumLabel(sources, row.source, t),
        hits: formatNumber(row.count, locale),
        share: t('ui.percent', {n: formatNumber(row.share * 100, locale, 1)})
      })),
    choices: [['all', t('ui.all')], ...Object.entries(sources).map(([id, key]): [string, string] => [id, t(key)])],
    caption: list ? t('rule.distributionCaption', {n: list.flows.length}) : null,
    coverage: list ? coverageView(list, t, lang) : null,
    droppedUnknown: list?.dropped_records === null
  };
}
// A typed condition: a call like `domain(...)`, no outbound of its own, and nothing that escapes its line.
const rawCondition = (raw: string) => /\w\(/.test(raw) && !raw.includes('->') && isFragment(raw);
export type RuleDraftView = {
  choices: Choice[];
  hint: string;
  preview: string | null;
  mode: string;
  valid: boolean;
  rawInvalid: boolean;
  pickError: string | undefined;
};
export function ruleDraftView(kind: ConditionKind, value: string, on: boolean, condition: string | null, raw: string, t: Translator) {
  const picked = value.trim() !== '';
  return {
    choices: conditionKinds.map(id => ({id, label: t(kindLabels[id])})),
    hint: kindHints[kind],
    preview: on && picked ? condition : null,
    mode: on ? 'pick' : 'text',
    valid: on ? picked && condition !== null : rawCondition(raw),
    rawInvalid: raw !== '' && !rawCondition(raw),
    pickError: picked && condition === null ? t('rule.valuesInvalid') : undefined
  };
}
export function removalView(rule: RoutingRule, sources: ConfigSource[], t: Translator) {
  return {
    expression: rule.expression,
    help: t('rule.removeHelp', {file: rule.source ? sourceLabel(rule.source, sourceFor(sources, rule.source)) : '', line: rule.source?.line ?? ''})
  };
}

type RulesView = {tabs: {id: RuleTab; label: string}[]; tab: string; fallback: string | null};
// The default tab is the first one the backend offers; until the capabilities are known it is not fixed (null).
export function rulesView(resources: Capabilities['resources'] | undefined, query: string, t: Translator): RulesView {
  const tabs = rulesTabs(resources).map(tab => ({id: tab.id, label: t(tab.titleKey)}));
  const first = tabs[0]?.id ?? 'map';
  return {
    tabs,
    tab: pickTab(
      query,
      tabs.map(tab => tab.id),
      first
    ),
    fallback: resources ? first : null
  };
}

const outcomes: Record<string, Key> = {
  matched: 'rule.result.matched',
  not_matched: 'rule.result.not_matched',
  skipped: 'rule.result.skipped',
  indeterminate: 'rule.result.indeterminate'
};
export type EvaluationView = {
  heading: string;
  fields: [string, string][];
  hint: string | null;
  label: string;
  probe: {id: string; label: string; pending: boolean; disabled: boolean} | null;
  rows: {id: string; expression: string; outcome: string; tone: 'ok' | 'warn' | 'muted' | 'neutral'; missing: string}[];
};
export function evaluationView(
  evaluation: RoutingEvaluation,
  index: number,
  domain: string | undefined,
  likely: string | null,
  selected: {groups: GroupSummary[]; node: Node | null} | null,
  canProbe: boolean,
  busy: string | null,
  t: Translator,
  lang: Lang
): EvaluationView {
  const node = selected?.node;
  const health = node ? preferredHealth(node) : undefined;
  const reach = !node
    ? t('rule.noMember')
    : health?.state === 'healthy' && health.latency_ms != null
      ? formatLatency(health.latency_ms, t)
      : health?.state === 'unavailable'
        ? t('ui.unavailable')
        : t('rule.untested');
  return {
    heading: evaluation.dst_ip ?? domain ?? '',
    label: t('rule.evaluation', {n: index + 1}),
    fields: [
      [t('rule.decision'), t(evaluation.decision === 'determinate' ? 'rule.determinate' : 'rule.result.indeterminate')],
      [t(likely ? 'rule.likelyOutbound' : 'ui.outbound'), outboundLabel(likely ?? evaluation.outbound, t)],
      ...(evaluation.missing_inputs.length ? [[t('rule.missing'), formatList(lang, evaluation.missing_inputs)] as [string, string]] : []),
      ...(selected
        ? [
            [t('rule.node'), [...selected.groups.map(group => group.name), ...(node ? [node.name] : [])].join(' → ')] as [string, string],
            [t('rule.reach'), reach] as [string, string]
          ]
        : [])
    ],
    hint: likely ? t('rule.likelyHelp', {inputs: formatList(lang, evaluation.missing_inputs)}) : null,
    probe:
      node && canProbe && !isBuiltinOutbound(node.protocol)
        ? {id: node.id, label: t('nodes.probe', {name: node.name}), pending: busy === node.id, disabled: !!busy}
        : null,
    rows: evaluation.rules.map(rule => ({
      id: rule.rule_id,
      expression: rule.expression ?? rule.rule_id,
      outcome: enumLabel(outcomes, rule.result, t),
      tone: rule.result === 'matched' ? 'ok' : rule.result === 'indeterminate' ? 'warn' : rule.result === 'skipped' ? 'muted' : 'neutral',
      missing: formatList(lang, rule.missing_inputs) || '—'
    }))
  };
}
type DnsView = {id: string; heading: string; fields: [string, string][]};
export function dnsView(dns: RoutingTraceResponse['dns'][number], t: Translator, lang: Lang): DnsView {
  const phrase = (value: string | null) => {
    const result = word(value);
    return typeof result === 'string' ? result : t(result.key, result.params);
  };
  return {
    id: dns.lookup_id,
    heading: t('rule.dnsHeading', {name: dns.name}),
    fields: [
      [t('ui.type'), dns.qtype],
      [t('ui.state'), dns.status],
      [t('ui.source'), phrase(dns.source)],
      [t('ui.cache'), phrase(dns.cache)],
      [t('rule.address'), formatList(lang, dns.addresses) || '—'],
      ...(dns.selected_ip ? [[t('rule.simulatedAddress'), dns.selected_ip] as [string, string]] : []),
      ...(dns.error ? [[t('ui.error'), dns.error] as [string, string]] : [])
    ]
  };
}
export function traceStatusView(result: RoutingTraceResponse, t: Translator, lang: Lang): string {
  return (
    t('ui.valuePair', {label: t('rule.observed'), value: localTime(result.observed_at, LOCALE[lang])}) +
    t('ui.separator') +
    t('ui.valuePair', {label: t('ui.generation'), value: result.generation_id})
  );
}
