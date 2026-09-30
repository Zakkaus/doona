import type {
  Capabilities,
  ConfigSource,
  DnsQueryResponse,
  DnsRoutingRule,
  FlowList,
  RecorderState,
  GroupSummary,
  Node,
  RoutingEvaluation,
  RoutingRule,
  RoutingTraceRequest,
  RoutingTraceResponse,
  RuleSource
} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {isBuiltinOutbound} from '../../dae/vocab';
import {formatList, formatNumber, LOCALE, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import {isFragment, scanConfig, unquote} from '../../dae/text';
import {localTime, formatLatency} from '../../i18n/format';
import {outboundLabel, preferredHealth, simulatedAddress} from '../../api/selectors';
import {conditionKinds, type RuleConditionKind} from '../../dae/groups';
import {fileName} from '../../dae/sources';
import {coverageView, type CoverageView} from '../shared/coverage';
import {word} from '../../api/labels';
import {dnsListEnd, dnsRuleAnchor, dnsRuleTarget, ruleAnchor, sourceFor, type DnsRuleListId} from '../../dae/ruleText';
import type {SearchSection} from '../../ui/SearchSelect';
import {ruleDistribution} from './distribution';
import {href, pickTab, within} from '../../shell/route';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';
import type {Help} from '../../ui/ui';
import {rulesTabs, type RuleTab} from './nav';
import {dnsActions, dnsEndPosition, dnsUpstreamChoices, ruleKindLabels, ruleOutbounds, type QuickRuleSeed} from '../shared/rule';
import {recorderEmpty} from '../shared/recorder';

const kindHints: Record<RuleConditionKind, string> = {
  domainSuffix: 'example.com, example.org',
  domain: 'www.example.com',
  geosite: 'netflix, cn',
  dip: '10.0.0.0/8, 224.0.0.0/4',
  geoip: 'cn, private',
  sip: '192.168.1.10',
  dport: '80, 443',
  sport: '53',
  pname: 'curl, firefox',
  l4proto: 'udp',
  qnameSuffix: 'example.com, lan',
  qnameFull: 'www.example.com',
  qnameKeyword: 'tracker',
  qnameGeosite: 'cn, category-ads-all',
  qtype: 'A, AAAA, HTTPS',
  upstream: 'alidns',
  answerIp: '0.0.0.0/32, 10.0.0.0/8',
  answerGeoip: 'cn, private'
};
const sources: Record<string, Key> = {kernel: 'rule.sourceKernel', recomputed: 'rule.sourceRecomputed', unknown: 'rule.sourceUnknown'};
const sourceHelp: Record<string, Key> = {kernel: 'rule.sourceHelp.kernel', recomputed: 'rule.sourceHelp.recomputed', unknown: 'rule.sourceHelp.unknown'};
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
  // Why the rule's target cannot be edited here, or null when it can.
  editReason: string | null;
  // Why a rule that is not removable cannot be removed here; null when it is, or for a fallback.
  removeReason: string | null;
  sourceQuery: string | null;
};
// `outbounds`: every target a rule can name. `outboundSections`: the same targets in sections, for a list long enough
// to need the searchable picker; null for the short DNS action lists.
export type DictionaryView = {
  rows: DictionaryRow[];
  caption: string | null;
  positions: Choice[];
  outbounds: Choice[];
  outboundSections: SearchSection[] | null;
};
// The file a rule came from, by the name the configuration page uses; a redacted path shows nothing.
function sourceLabel(source: RuleSource, linked: ConfigSource | undefined): string {
  return linked ? fileName(linked) : source.file === '<redacted>' ? '' : source.file;
}
// Why Add rule is disabled: no rule in a writable file to insert beside, else another change still being applied.
export const addRuleTip = (noPosition: boolean, busy: boolean, t: Translator) =>
  noPosition ? t('conn.ruleNoPosition') : busy ? t('ui.changeApplying') : undefined;

// Why Add in the add-rule dialog is disabled, first applicable: the condition is missing or invalid, then no target.
export type ReasonKeys = {conditionInvalid: Key; targetMissing: Key};
const routingReasons: ReasonKeys = {conditionInvalid: 'rule.conditionInvalid', targetMissing: 'rule.outboundMissing'};
export function addRuleReason(
  draft: Pick<RuleDraftView, 'valid' | 'mode' | 'pickError' | 'rawInvalid'>,
  outbound: string,
  t: Translator,
  keys: ReasonKeys = routingReasons
): string | null {
  if (!draft.valid) {
    if (draft.mode === 'pick') return draft.pickError ?? t('rule.valuesMissing');
    return t(draft.rawInvalid ? keys.conditionInvalid : 'rule.conditionMissing');
  }
  return outbound ? null : t(keys.targetMissing);
}

// Why Run trace is disabled, first applicable: the backend cannot trace, the form is incomplete or wrong, or the
// resolution mode is not offered. Null while the capabilities load or a trace runs.
export function traceReason(
  {loaded, busy, available, invalid, modeOffered}: {loaded: boolean; busy: boolean; available: boolean; invalid: Key | null; modeOffered: boolean},
  t: Translator
): string | null {
  if (!loaded || busy) return null;
  if (!available) return t('rule.traceUnavailable');
  if (invalid) return t(invalid);
  return modeOffered ? null : t('rule.resolveUnavailable');
}

// A rule of either list as the dictionary shows it: GET /rules and GET /dns/rules entries share these fields.
type Listed = {rule_id: string; index: number; kind: 'rule' | 'fallback'; expression: string; source: RuleSource | null};
// The rows and insertion points of a rule list; `anchor` locates a rule in its source, and only a rule doona can
// locate is offered for removal or as an insertion point. `end` says whether a list whose fallback is not written can
// still take a rule at its end.
function listedRows<R extends Listed>(
  rules: R[],
  config: ConfigSource[],
  anchor: (source: ConfigSource, rule: R, scan: ReturnType<typeof scanConfig>) => unknown,
  // The target, hits and, when it differs from the listed text, the expression a row shows.
  fields: (rule: R) => {outbound: string; must: boolean; hits: string; expression?: string},
  t: Translator,
  lang: Lang,
  // The end position of a list whose fallback is not written, when it has one.
  end: {id: 'end'; label: string; desc?: string} | null = null
): Pick<DictionaryView, 'rows' | 'positions'> {
  const locale = LOCALE[lang];
  const byId = new Map(config.map(source => [source.id, source]));
  const resolve = (source: RuleSource | null | undefined) => {
    if (!source) return undefined;
    return byId.get(source.source_id);
  };
  const scans = new Map<string, ReturnType<typeof scanConfig>>();
  // Why doona cannot locate a rule's line to rewrite it, or null when it can.
  const unanchored = (rule: R): string | null => {
    const source = rule.source && byId.get(rule.source.source_id);
    if (!source) return t('rule.notLocated');
    if (!source.writable) return t('config.readOnlyAttempt');
    if (!scans.has(source.id)) scans.set(source.id, scanConfig(source.content));
    if (anchor(source, rule, scans.get(source.id)!) !== null) return null;
    // An include file spliced into a routing section holds bare rules, outside any routing section of its own.
    return source.kind === 'include' ? t('rule.inInclude', {file: fileName(source)}) : t('rule.notLocated');
  };
  const rows = rules.map(rule => {
    const linked = resolve(rule.source);
    const label = rule.source ? sourceLabel(rule.source, linked) : '';
    const editReason = unanchored(rule);
    return {
      id: rule.rule_id,
      number: rule.kind === 'fallback' ? '—' : formatNumber(rule.index + 1, locale),
      expression: rule.expression,
      ...fields(rule),
      position: rule.source ? (label ? `${label}:${rule.source.line}` : t('rule.lineOnly', {n: rule.source.line})) : '—',
      removable: rule.kind === 'rule' && editReason === null,
      editReason,
      removeReason: rule.kind === 'rule' ? editReason : null,
      sourceQuery: linked && rule.source ? within('', {tab: 'source', source: linked.id, line: String(rule.source.line)}) : null
    };
  });
  const fallback = rules.find(rule => rule.kind === 'fallback');
  return {
    rows,
    positions: [
      ...(fallback?.source ? (unanchored(fallback) === null ? [{id: 'end', label: t('rule.positionEnd')}] : []) : end ? [end] : []),
      ...rules
        .filter((_, i) => rows[i].removable)
        .map(rule => ({id: rule.rule_id, label: t('rule.positionBefore', {n: rule.index + 1}), desc: rule.expression}))
    ]
  };
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
  const sections = ruleOutbounds(groups, t);
  return {
    ...listedRows(
      rules,
      config,
      ruleAnchor,
      rule => ({
        outbound: rule.outbound ?? '',
        must: rule.must,
        hits: hits.has(rule.rule_id) ? formatNumber(hits.get(rule.rule_id)!, locale) : '—'
      }),
      t,
      lang
    ),
    caption: generation !== undefined ? t('rule.dictionaryCaption', {n: rules.length, generation}) : null,
    outbounds: sections.flatMap(section => section.items),
    outboundSections: sections
  };
}
// A DNS rule's expression is its source line; the table shows the target in its own column, so a rule shows only its
// condition, as a routing rule does.
function dnsCondition(rule: DnsRoutingRule): string {
  const arrow = /\s*->\s*('[^']*'|"[^"]*"|\S+)$/.exec(rule.expression);
  return rule.kind === 'rule' && arrow && arrow[1].toLowerCase() === dnsRuleTarget(rule).toLowerCase()
    ? rule.expression.slice(0, arrow.index)
    : rule.expression;
}
// One list of GET /dns/rules. The upstreams a new rule can name are those the configuration defines, and any the list
// already names that the text doona holds does not show.
export function dnsDictionaryView(
  list: DnsRuleListId,
  rules: DnsRoutingRule[],
  generation: string | undefined,
  config: ConfigSource[],
  t: Translator,
  lang: Lang
): DictionaryView {
  const end = dnsListEnd(config, list);
  const upstreams = [...new Set(dnsUpstreamChoices(rules, config).map(upstream => upstream.name))];
  return {
    ...listedRows(
      rules,
      config,
      (source, rule, scan) => dnsRuleAnchor(source, rule, list, scan),
      rule => ({expression: dnsCondition(rule), outbound: unquote(dnsRuleTarget(rule)), must: false, hits: '—'}),
      t,
      lang,
      end && {id: 'end', ...dnsEndPosition(end.anchor, list, t)}
    ),
    caption: generation !== undefined ? t('rule.dictionaryCaption', {n: rules.length, generation}) : null,
    outbounds: dnsActions(list, upstreams, t),
    outboundSections: null
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
  empty: string;
  sourceHelp: Help;
};
export function distributionEmpty(recorder: RecorderState | undefined, source: string, t: Translator): string {
  return t(
    recorderEmpty(recorder, source !== 'all', {
      forbidden: 'rule.distributionForbidden',
      off: 'rule.distributionNotRecorded',
      filtered: 'rule.distributionFiltered',
      empty: 'rule.distributionEmpty'
    })
  );
}
export function distributionView(list: FlowList | undefined, source: string, t: Translator, lang: Lang, recorder?: RecorderState): DistributionView {
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
        share: t('ui.percent', {n: row.share * 100}, 'n', {n: 1})
      })),
    choices: [['all', t('ui.all')], ...Object.entries(sources).map(([id, key]): [string, string] => [id, t(key)])],
    caption: list ? t('rule.distributionCaption', {n: list.flows.length}) : null,
    coverage: list ? coverageView(list, t, lang) : null,
    droppedUnknown: list?.dropped_records === null,
    empty: distributionEmpty(recorder, source, t),
    sourceHelp: {
      title: t('rule.distributionSource'),
      text: Object.entries(sourceHelp).map(([id, help]) => t('ui.valuePair', {label: t(sources[id]), value: t(help)}))
    }
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
export function ruleDraftView(
  kind: RuleConditionKind,
  value: string,
  on: boolean,
  condition: string | null,
  raw: string,
  t: Translator,
  kinds: readonly RuleConditionKind[] = conditionKinds
) {
  const picked = value.trim() !== '';
  return {
    choices: kinds.map(id => ({id, label: t(ruleKindLabels[id])})),
    hint: kindHints[kind],
    preview: on && picked ? condition : null,
    mode: on ? 'pick' : 'text',
    valid: on ? picked && condition !== null : rawCondition(raw),
    rawInvalid: raw !== '' && !rawCondition(raw),
    pickError: picked && condition === null ? t('rule.valuesInvalid') : undefined
  };
}
export function removalView(rule: Pick<RoutingRule, 'expression' | 'source'>, sources: ConfigSource[], t: Translator) {
  return {
    expression: rule.expression,
    help: t('rule.removeHelp', {file: rule.source ? sourceLabel(rule.source, sourceFor(sources, rule.source)) : '', line: rule.source?.line ?? ''})
  };
}

type RulesView = {tabs: {id: RuleTab; label: string}[]; tab: string; fallback: string | null};
// The default tab is the first one the backend offers; until the capabilities are known it is not fixed (null).
export function rulesView(resources: Capabilities['resources'] | undefined, query: string, t: Translator): RulesView {
  const tabs = rulesTabs(resources).map(tab => ({id: tab.id, label: t(tab.titleKey)}));
  const first = tabs[0]?.id ?? 'list';
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
  // `href` opens the rule in the rule list when the list holds it.
  rows: {id: string; expression: string; outcome: string; tone: 'ok' | 'warn' | 'muted' | 'neutral'; missing: string; href?: string}[];
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
export type ResultLink = {id: string; label: string; href: string};
// The Policies page for each group the selected chain passes, when the backend lists groups, and the Nodes page for
// its node once the provider list that decides the node's owner is known.
export function chainLinks(
  selected: {groups: GroupSummary[]; node: Node | null} | null,
  groupsListed: boolean,
  providers: ReadonlyArray<{id: string}> | undefined,
  t: Translator
): ResultLink[] {
  if (!selected) return [];
  const {groups, node} = selected;
  return [
    ...(groupsListed
      ? groups.map(group => ({id: 'group:' + group.id, label: t('rule.viewGroup', {name: group.name}), href: href('policies', {group: group.id})}))
      : []),
    ...(node && providers ? [{id: 'node:' + node.id, label: t('rule.viewNode', {name: node.name}), href: nodeHref(node, providers)}] : [])
  ];
}
// A resolved name in DNS Query, filled in, and in the DNS cache, filtered to it, as far as the backend offers them.
export function nameLinks(name: string, resources: Capabilities['resources'] | undefined, t: Translator): ResultLink[] {
  const domain = name.replace(/\.$/, '');
  return [
    ...(offered(resources, 'dns_query', {whileLoading: false}) ? [{id: 'query', label: t('rule.queryDns'), href: href('dns', {tab: 'query', domain})}] : []),
    ...(offered(resources, 'dns_cache', {whileLoading: false}) ? [{id: 'cache', label: t('dns.viewCache'), href: href('dns', {tab: 'cache', domain})}] : [])
  ];
}
// What the add-rule dialog starts from for one evaluation: the traced target as the evaluation saw it, and the rule it
// matched when the evaluation was decided.
export function traceSeed(input: RoutingTraceRequest['input'], evaluation: RoutingEvaluation): QuickRuleSeed {
  const matched = evaluation.rules.find(rule => rule.result === 'matched');
  return {
    domain: input.domain ?? null,
    dip: evaluation.dst_ip ?? input.dst_ip ?? null,
    sip: input.src_ip ?? null,
    outbound: evaluation.outbound,
    matched: matched && evaluation.decision === 'determinate' ? {id: matched.rule_id, expression: matched.expression ?? null} : null
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
// A query-mode run's DNS query, shown apart from the simulations it fed: one row per record type with its answers, or
// its status when it has none, and the address that type simulated.
export function queryView(query: DnsQueryResponse, t: Translator, lang: Lang): DnsView {
  const rows = query.results.map(result => {
    const answers = formatList(
      lang,
      (result.answers ?? []).filter(answer => answer.type === result.type).map(answer => answer.data)
    );
    const simulated = simulatedAddress(result);
    return [
      result.type,
      (answers || result.status) + (simulated ? t('ui.separator') + t('ui.valuePair', {label: t('rule.simulatedAddress'), value: simulated}) : '')
    ] as [string, string];
  });
  const upstreams = [...new Set(query.results.map(result => (result.cached ? t('dns.hit') : (result.upstream ?? '—'))))];
  return {
    id: 'query',
    heading: t('rule.queryHeading', {name: query.domain.replace(/\.$/, '')}),
    fields: [...rows, [t('ui.upstream'), formatList(lang, upstreams)]]
  };
}
export function traceStatusView(result: RoutingTraceResponse, query: DnsQueryResponse | null, t: Translator, lang: Lang): string {
  return (
    (query ? t('ui.valuePair', {label: t('rule.queried'), value: localTime(query.query_time, LOCALE[lang])}) + t('ui.separator') : '') +
    t('ui.valuePair', {label: t('rule.observed'), value: localTime(result.observed_at, LOCALE[lang])}) +
    t('ui.separator') +
    t('ui.valuePair', {label: t('ui.generation'), value: result.generation_id})
  );
}
