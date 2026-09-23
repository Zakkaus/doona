import type {Capabilities, ConfigSource, FlowList, GroupSummary, Node, RoutingEvaluation, RoutingRule, RoutingTraceResponse, RuleSource} from '../../api/model';
import {formatList, formatNumber, LOCALE, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import {isFragment} from '../../dae/text';
import {localTime, outboundLabel, preferredHealth} from '../../api/selectors';
import {millis} from '../../api/u64';
import {conditionKinds, type ConditionKind} from '../../dae/groups';
import {fileName} from '../config/names';
import {coverageView, word, type CoverageView} from './flows/view';
import {sourceFor} from './source';
import {ruleDistribution} from './distribution';
import {pickTab, within} from '../../shell/route';
import {offered} from '../../api/capabilities';

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
  const byFile = new Map<string, ConfigSource | undefined>();
  const resolve = (source: RuleSource | null | undefined) => {
    if (!source) return undefined;
    if (source.source_id) return byId.get(source.source_id);
    if (!byFile.has(source.file)) byFile.set(source.file, sourceFor(config, source));
    return byFile.get(source.file);
  };
  const rows = rules.map(rule => {
    const source = byId.get(rule.source?.source_id ?? '');
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
      removable: rule.kind === 'rule' && !!source?.writable && source.content !== undefined,
      sourceQuery: linked && rule.source ? within('', {tab: 'source', source: linked.id, line: String(rule.source.line)}) : null
    };
  });
  const writable = (rule: RoutingRule) => {
    const source = byId.get(rule.source?.source_id ?? '');
    return !!source?.writable && source.content !== undefined;
  };
  const fallback = rules.find(rule => rule.kind === 'fallback');
  return {
    rows,
    caption: generation !== undefined ? t('rule.dictionaryCaption', {n: formatNumber(rules.length, locale), generation}) : null,
    positions: [
      ...(fallback && writable(fallback) ? [{id: 'end', label: t('rule.positionEnd')}] : []),
      ...rules
        .filter(rule => rule.kind === 'rule' && writable(rule))
        .map(rule => ({id: rule.rule_id, label: t('rule.positionBefore', {n: rule.index + 1}), desc: rule.expression}))
    ],
    outbounds: [...groups.map(group => group.name), 'direct', 'block'].map(id => ({id, label: id}))
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
        source: t(sources[row.source]),
        hits: formatNumber(row.count, locale),
        share: t('ui.percent', {n: formatNumber(row.share * 100, locale, 1)})
      })),
    choices: [['all', t('ui.all')], ...Object.entries(sources).map(([id, key]): [string, string] => [id, t(key)])],
    caption: list ? t('rule.distributionCaption', {n: formatNumber(list.flows.length, locale)}) : null,
    coverage: list ? coverageView(list, t, lang) : null,
    droppedUnknown: list?.dropped_records === null
  };
}
// A typed condition: a call like `domain(...)`, no outbound of its own, and nothing that escapes its line.
const rawCondition = (raw: string) => /\w\(/.test(raw) && !raw.includes('->') && isFragment(raw);
export type RuleDraftView = {choices: Choice[]; hint: string; preview: string | null; mode: string; valid: boolean; rawInvalid: boolean};
export function ruleDraftView(kind: ConditionKind, value: string, on: boolean, condition: string, raw: string, t: Translator) {
  return {
    choices: conditionKinds.map(id => ({id, label: t(kindLabels[id])})),
    hint: kindHints[kind],
    preview: on && value.trim() ? condition : null,
    mode: on ? 'pick' : 'text',
    valid: on ? value.trim() !== '' : rawCondition(raw),
    rawInvalid: raw !== '' && !rawCondition(raw)
  };
}
export function removalView(rule: RoutingRule, sources: ConfigSource[], t: Translator) {
  return {
    expression: rule.expression,
    help: t('rule.removeHelp', {file: rule.source ? sourceLabel(rule.source, sourceFor(sources, rule.source)) : '', line: rule.source?.line ?? ''})
  };
}

type RuleTab = 'map' | 'list' | 'flows' | 'trace';
export function rulesTabs(resources: Capabilities['resources'] | undefined): Array<{id: RuleTab; titleKey: Key}> {
  const flows = offered(resources, 'flows', {whileLoading: true});
  const rules = offered(resources, 'rules', {whileLoading: false});
  return [
    ...(flows ? [{id: 'map' as const, titleKey: 'rule.map' as const}] : []),
    ...(flows || rules ? [{id: 'list' as const, titleKey: 'rule.listTitle' as const}] : []),
    ...(flows ? [{id: 'flows' as const, titleKey: 'rule.flows' as const}] : []),
    ...(offered(resources, 'routing_trace', {whileLoading: true}) ? [{id: 'trace' as const, titleKey: 'rule.trace' as const}] : [])
  ];
}
type RulesView = {tabs: {id: RuleTab; label: string}[]; tab: string};
export function rulesView(resources: Capabilities['resources'] | undefined, query: string, t: Translator): RulesView {
  const tabs = rulesTabs(resources).map(tab => ({id: tab.id, label: t(tab.titleKey)}));
  return {
    tabs,
    tab: pickTab(
      query,
      tabs.map(tab => tab.id),
      tabs[0]?.id ?? 'map'
    )
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
      ? t('ui.latency', {n: millis(health.latency_ms)})
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
      node && canProbe && node.protocol !== 'direct' && node.protocol !== 'block'
        ? {id: node.id, label: t('nodes.probe', {name: node.name}), pending: busy === node.id, disabled: !!busy}
        : null,
    rows: evaluation.rules.map(rule => ({
      id: rule.rule_id,
      expression: rule.expression ?? rule.rule_id,
      outcome: outcomes[rule.result] ? t(outcomes[rule.result]) : rule.result,
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
