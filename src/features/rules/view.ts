import type {Capabilities, ConfigSource, FlowList, GroupSummary, Node, RoutingEvaluation, RoutingRule, RoutingTraceResponse, RuleSource} from '../../api/model';
import {formatList, formatNumber, LOCALE, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {localTime, outboundLabel, preferredHealth} from '../../api/selectors';
import {millis} from '../../api/u64';
import {conditionKinds, type ConditionKind} from '../config/groups';
import {fileName} from '../config/names';
import {coverageView, word, type CoverageView} from '../flows/view';
import {sourceFor} from './source';
import {ruleDistribution} from './distribution';

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
export type Choice = {id: string; label: string; desc?: string};
export type DictionaryRow = {
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
function sourceLabel(source: RuleSource, config: ConfigSource[]): string {
  const matched = sourceFor(config, source);
  return matched ? fileName(matched) : source.file === '<redacted>' ? '' : source.file;
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
  const hits = new Map(ruleDistribution(flows?.flows ?? []).map(row => [row.id, row.count]));
  const rows = rules.map(rule => {
    const source = config.find(source => source.id === rule.source?.source_id);
    const linked = sourceFor(config, rule.source);
    const label = rule.source ? sourceLabel(rule.source, config) : '';
    return {
      id: rule.rule_id,
      number: rule.kind === 'fallback' ? '—' : String(rule.index + 1),
      expression: rule.expression,
      outbound: rule.outbound ?? '',
      must: rule.must,
      position: rule.source ? (label ? `${label}:${rule.source.line}` : t('rule.lineOnly', {n: String(rule.source.line)})) : '—',
      hits: hits.has(rule.rule_id) ? formatNumber(hits.get(rule.rule_id)!, locale) : '—',
      removable: rule.kind === 'rule' && !!source?.writable && source.content !== undefined,
      sourceQuery: linked && rule.source ? `tab=source&source=${encodeURIComponent(linked.id)}&line=${rule.source.line}` : null
    };
  });
  const writable = (rule: RoutingRule) => {
    const source = config.find(source => source.id === rule.source?.source_id);
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
        .map(rule => ({id: rule.rule_id, label: t('rule.positionBefore', {n: String(rule.index + 1)}), desc: rule.expression}))
    ],
    outbounds: [...groups.map(group => group.name), 'direct', 'block'].map(id => ({id, label: id}))
  };
}
export type DistributionRow = {
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
  const rows = ruleDistribution(list?.flows ?? [])
    .map((row, i) => ({...row, key: String(i)}))
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
        share: formatNumber(row.share * 100, locale, 1) + '%'
      })),
    choices: [['all', t('ui.all')], ...Object.entries(sources).map(([id, key]): [string, string] => [id, t(key)])],
    caption: list ? t('rule.distributionCaption', {n: formatNumber(list.flows.length, locale)}) : null,
    coverage: list ? coverageView(list, t, lang) : null,
    droppedUnknown: list?.dropped_records === null
  };
}
export type RuleDraftView = {choices: Choice[]; hint: string; preview: string | null; mode: string; valid: boolean; rawInvalid: boolean};
export function ruleDraftView(kind: ConditionKind, value: string, on: boolean, condition: string, raw: string, t: Translator) {
  return {
    choices: conditionKinds.map(id => ({id, label: t(kindLabels[id])})),
    hint: kindHints[kind],
    preview: on && value.trim() ? condition : null,
    mode: on ? 'pick' : 'text',
    valid: on ? value.trim() !== '' : /\w\(/.test(raw) && !raw.includes('->'),
    rawInvalid: raw !== '' && !(/\w\(/.test(raw) && !raw.includes('->'))
  };
}
export function removalView(rule: RoutingRule, sources: ConfigSource[], t: Translator) {
  return {
    expression: rule.expression,
    help: t('rule.removeHelp', {file: rule.source ? sourceLabel(rule.source, sources) : '', line: String(rule.source?.line ?? '')})
  };
}

export type RulesView = {tabs: {id: 'map' | 'list' | 'flows' | 'trace'; label: string}[]; tab: string};
export function rulesView(resources: Capabilities['resources'] | undefined, requested: string | null, t: Translator): RulesView {
  const flows = resources?.flows.available !== false;
  const rules = resources?.rules.available === true;
  const tabs: RulesView['tabs'] = [
    ...(flows ? [{id: 'map' as const, label: t('rule.map')}] : []),
    ...(flows || rules ? [{id: 'list' as const, label: t('rule.listTitle')}] : []),
    ...(flows ? [{id: 'flows' as const, label: t('rule.flows')}] : []),
    ...(resources?.routing_trace.available !== false ? [{id: 'trace' as const, label: t('rule.trace')}] : [])
  ];
  return {tabs, tab: tabs.some(tab => tab.id === requested) ? requested! : (tabs[0]?.id ?? 'map')};
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
export type DnsView = {id: string; heading: string; fields: [string, string][]};
export function dnsView(dns: RoutingTraceResponse['dns'][number], t: Translator, lang: Lang): DnsView {
  const phrase = (value: string | null) => {
    const result = word(value);
    return typeof result === 'string' ? result : t(result.key, result.params);
  };
  return {
    id: dns.lookup_id,
    heading: 'DNS · ' + dns.name,
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
    ' · ' +
    t('ui.valuePair', {label: t('ui.generation'), value: result.generation_id})
  );
}
