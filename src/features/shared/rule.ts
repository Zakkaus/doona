import {dnsEndPosition} from './ruleNotice';
import type {ConfigSource, DnsLogRecord, DnsRoutingRule, RoutingRule} from '../../api/model';
import {ruleCondition, type RuleConditionKind} from '../../dae/groups';
import type {Key, Translator} from '../../i18n';
import type {PendingRule} from '../../store';
import {dnsListEnd, dnsRuleAnchor, dnsUpstreams, ruleAnchor, type DnsRuleListId} from '../../dae/ruleText';
import {unquote} from '../../dae/text';
import {builtinOutboundNames, isBuiltinOutbound} from '../../dae/vocab';
import type {SearchSection} from '../../ui/SearchSelect';

// What an origin knows about the traffic a new rule is for: its domain, destination and source IP, the outbound it
// took, and the rule it matched when the origin vouches for that match. Each page that offers the add-rule dialog turns
// its own item into one.
export type QuickRuleSeed = {
  domain: string | null;
  dip: string | null;
  sip: string | null;
  outbound: string | null;
  // Rule ids are scoped to a generation: a recorded origin names its generation (null when unknown), while a live
  // connection carries none and is checked by its expression instead.
  matched: {id: string; expression: string | null; generation?: string | null} | null;
  // What a DNS origin adds, which offers the DNS lists too: the record type asked for, the A and AAAA addresses
  // answered, the upstream that answered, and the query to repeat once a DNS rule is written.
  dns?: {type: string | null; answers: string[]; upstream: string | null; query: {name: string; type: string} | null};
};
// What each condition kind is called in a picker.
export const ruleKindLabels: Record<RuleConditionKind, Key> = {
  domainSuffix: 'rule.kind.domainSuffix',
  domain: 'rule.kind.domain',
  domainKeyword: 'rule.kind.domainKeyword',
  geosite: 'rule.kind.geosite',
  dip: 'ui.destinationIp',
  geoip: 'rule.kind.geoip',
  sip: 'ui.sourceIp',
  dport: 'rule.kind.dport',
  sport: 'rule.kind.sport',
  pname: 'ui.process',
  l4proto: 'rule.kind.l4proto',
  qnameSuffix: 'rule.kind.domainSuffix',
  qnameFull: 'rule.kind.domain',
  qnameKeyword: 'rule.kind.domainKeyword',
  qnameGeosite: 'rule.kind.geosite',
  qtype: 'rule.dns.kind.qtype',
  upstream: 'rule.dns.kind.upstream',
  answerIp: 'rule.dns.kind.answerIp',
  answerGeoip: 'rule.dns.kind.answerGeoip'
};
// The list a quick rule goes into: the routing rules, or one of the two DNS lists.
export type RuleList = PendingRule['list'];
export const ruleListLabels: Record<RuleList, Key> = {routing: 'rule.listTitle', request: 'rule.list.request', response: 'rule.list.response'};

// The addresses of the A and AAAA records among an answer, as a response rule's `ip` can match them; other records,
// such as a CNAME, carry names.
export const answerAddresses = (answers: ReadonlyArray<Pick<DnsLogRecord['answers'][number], 'type' | 'data'>>) => [
  ...new Set(answers.filter(answer => answer.type === 'A' || answer.type === 'AAAA').map(answer => answer.data))
];

export type RuleTarget = {kind: RuleConditionKind; condition: string};
// Every condition the seed allows in a list, the default first, each address as one host; a value dae cannot hold is
// left out. Routing: the exact domain, then its subdomains and keyword, the destination IP and the source IP. A DNS request: the
// exact name, then its subdomains, and the client. A DNS response: each answered address, and the client.
export function ruleTargets(seed: Pick<QuickRuleSeed, 'domain' | 'dip' | 'sip' | 'dns'>, list: RuleList = 'routing'): RuleTarget[] {
  // A name as the resolver writes it ends in a dot, which a domain rule does not.
  const domain = seed.domain?.replace(/\.$/, '');
  const host = (ip: string | null) => ip && `${ip}/${ip.includes(':') ? 128 : 32}`;
  const seeds: Array<[RuleConditionKind, string | null | undefined]> =
    list === 'routing'
      ? [
          ['domain', domain],
          ['domainSuffix', domain],
          ['domainKeyword', domain],
          ['dip', host(seed.dip)],
          ['sip', host(seed.sip)]
        ]
      : !seed.dns
        ? []
        : list === 'request'
          ? [
              ['qnameFull', domain],
              ['qnameSuffix', domain],
              ['sip', host(seed.sip)]
            ]
          : [...seed.dns.answers.map((ip): [RuleConditionKind, string | null] => ['answerIp', host(ip)]), ['sip', host(seed.sip)]];
  return seeds.flatMap(([kind, value]) => {
    const condition = value ? ruleCondition(kind, value) : null;
    return condition ? [{kind, condition}] : [];
  });
}
// The lists the seed can start a rule in, each by the condition it is about: routing by any, a DNS request by the name
// and a DNS response by an answered address. A DNS origin starts in its own lists.
export function ruleLists(seed: QuickRuleSeed, dns: boolean): RuleList[] {
  const lists: RuleList[] = [];
  if (dns && seed.dns && ruleTargets(seed, 'request').some(target => target.kind !== 'sip')) lists.push('request');
  if (dns && seed.dns?.answers.length && ruleTargets(seed, 'response').some(target => target.kind !== 'sip')) lists.push('response');
  if (ruleTargets(seed).length) lists.push('routing');
  return lists;
}
// A DNS condition narrowed to one record type, when one is chosen.
export const typedCondition = (condition: string, type: string | null) => {
  const qtype = type && ruleCondition('qtype', type);
  return qtype ? `${condition} && ${qtype}` : condition;
};

// A listed rule's condition without the target the backend may display after it, a bare or quoted outbound with or
// without `(must)`, and without spaces, so the same condition compares equal however it was spelt. Not a semantic
// comparison: `dip(1.1.1.1)` and `dip(1.1.1.1/32)` differ.
export function conditionKey(expression: string): string {
  return expression
    .replace(/\s*->\s*("[^"]*"|'[^']*'|[^\s()'"]+)(\(must\))?\s*$/, '')
    .replace(/\s+/g, '')
    .replace(/"/g, "'");
}

// Where a new rule can go, the default first: before the rule the traffic matched, when the origin vouched for the match
// and the rule still reads as it did, so the new rule takes over that traffic; otherwise before the fallback, where
// earlier rules may still match first. The earliest place doona can write is offered too. Only a rule doona can locate
// in a writable source is offered.
export function rulePositions(rules: RoutingRule[], generation: string | undefined, sources: ConfigSource[], matched: QuickRuleSeed['matched'], t: Translator) {
  const anchored = (rule: RoutingRule) => ruleWritable(rule, sources);
  const current = matched && (matched.generation === undefined || (matched.generation !== null && matched.generation === generation));
  const hit =
    current &&
    rules.find(
      rule =>
        rule.rule_id === matched.id && anchored(rule) && (matched.expression === null || conditionKey(matched.expression) === conditionKey(rule.expression))
    );
  const end = rules.find(rule => rule.kind === 'fallback' && anchored(rule));
  const top = rules.find(anchored);
  const topLabel = (rule: RoutingRule) => (rule === rules[0] ? t('conn.ruleTop') : t('rule.positionBefore', {n: rule.index + 1}));
  const offered = [
    ...(hit ? [{rule: hit, label: t('conn.ruleBeforeMatched')}] : []),
    ...(end ? [{rule: end, label: t('rule.positionEnd')}] : []),
    ...(top ? [{rule: top, label: topLabel(top)}] : [])
  ];
  return offered
    .filter((item, i) => offered.findIndex(other => other.rule === item.rule) === i)
    .map(({rule, label}) => ({id: rule.rule_id, label, desc: rule.expression, matched: rule === hit, first: rule === rules[0]}));
}

// The rule a write added, once the reloaded list shows it: the nearest rule with its condition and outbound before the
// rule it was placed in front of, in the same source, since another write may have landed between them; else the first
// with them. Null until the list shows one.
export function acceptedRule(rules: RoutingRule[], condition: string, outbound: string, before: RoutingRule): string | null {
  const key = conditionKey(condition);
  const same = (rule: RoutingRule) => rule.kind === 'rule' && rule.outbound === outbound && conditionKey(rule.expression) === key;
  const inSource = (rule: RoutingRule) => rule.source?.source_id === before.source?.source_id;
  const anchor = rules.findIndex(rule => rule.kind === before.kind && inSource(rule) && conditionKey(rule.expression) === conditionKey(before.expression));
  const placed =
    anchor < 0
      ? undefined
      : rules
          .slice(0, anchor)
          .reverse()
          .find(rule => same(rule) && inSource(rule));
  return (placed ?? rules.find(same))?.rule_id ?? null;
}

// A listed rule as the duplicate notice compares it: its condition, and what it writes after its arrow.
export type ListedTarget = {kind: 'rule' | 'fallback'; index: number; expression: string; target: string};
// Where the list already holds a rule with this condition and target, or a rule held for it does, as the dialog says
// it; null when neither does. The accepted rule is named first, since it already applies. DNS upstream names compare
// without regard to case, as honk resolves them.
export function duplicateOf(list: RuleList, listed: ListedTarget[], held: PendingRule[], condition: string, target: string, t: Translator): string | null {
  const key = conditionKey(condition);
  const fold = (value: string) => (list === 'routing' ? value : value.toLowerCase());
  const found = listed.find(rule => rule.kind === 'rule' && fold(rule.target) === fold(target) && conditionKey(rule.expression) === key);
  const dns = list !== 'routing';
  if (found) return t(dns ? 'rule.dns.duplicateListed' : 'rule.duplicateListed', {n: found.index + 1});
  return held.some(rule => rule.list === list && fold(rule.outbound) === fold(target) && conditionKey(rule.condition) === key)
    ? t(dns ? 'rule.dns.duplicateHeld' : 'rule.duplicateHeld')
    : null;
}

// Whether doona can locate the rule in a writable source, which placing a rule beside it or editing it needs.
export function ruleWritable(rule: RoutingRule | undefined, sources: ConfigSource[]): boolean {
  const source = rule && sources.find(source => source.id === rule.source?.source_id);
  return !!source?.writable && ruleAnchor(source, rule!) !== null;
}

// The position a dialog pinned while it is still offered: the same id in the same generation, or the same id and
// description after a reload. Otherwise the first position, reported as moved so the dialog says so before writing there.
export type PositionPin = {generation: string; id: string; desc?: string};
export function pinnedPosition(positions: Array<{id: string; desc?: string}>, pin: PositionPin | null, generation?: string) {
  if (!pin) return {before: positions[0]?.id, moved: false};
  const kept = positions.find(position => position.id === pin.id && (generation === pin.generation || position.desc === pin.desc));
  return kept ? {before: kept.id, moved: false} : {before: positions[0]?.id, moved: true};
}

// Where a new rule can go in a DNS list, the default first: last, before the fallback when the list writes one, or at
// the list's end, in a new block when it has none; then the earliest place doona can write. `end` names the list's end.
export function dnsRulePositions(list: DnsRuleListId, rules: DnsRoutingRule[], sources: ConfigSource[], t: Translator) {
  const anchored = (rule: DnsRoutingRule) => {
    const source = sources.find(source => source.id === rule.source?.source_id);
    return !!source?.writable && dnsRuleAnchor(source, rule, list) !== null;
  };
  const fallback = rules.find(rule => rule.kind === 'fallback');
  const open = fallback?.source ? null : dnsListEnd(sources, list);
  const top = rules.find(anchored);
  const offered = [
    ...(fallback?.source && anchored(fallback)
      ? [{id: fallback.rule_id, label: t('rule.positionEnd'), desc: fallback.expression, first: fallback === rules[0]}]
      : []),
    ...(open ? [{id: 'end', ...dnsEndPosition(open.anchor, list, t), first: false}] : []),
    ...(top
      ? [
          {
            id: top.rule_id,
            label: top === rules[0] ? t('conn.ruleTop') : t('rule.positionBefore', {n: top.index + 1}),
            desc: top.expression,
            first: top === rules[0]
          }
        ]
      : [])
  ];
  return offered.filter((item, i) => offered.findIndex(other => other.id === item.id) === i).map(item => ({...item, matched: false}));
}

// The upstreams a new DNS rule can name: those the configuration defines, with their addresses, and any the list
// already names that the text doona holds does not show.
export function dnsUpstreamChoices(rules: DnsRoutingRule[], sources: ConfigSource[]): Array<{name: string; address: string | null}> {
  const defined = sources.flatMap(source => dnsUpstreams(source.content));
  const known = new Set(defined.map(upstream => upstream.name.toLowerCase()));
  const named = [...new Set(rules.flatMap(rule => (rule.upstream && !known.has(rule.upstream.toLowerCase()) ? [rule.upstream] : [])))];
  return [...defined, ...named.map(name => ({name, address: null}))];
}
// What a routing rule can route to, in the sections of a group's final outbound picker: direct and block, then the
// groups. A rule names a group or a built-in outbound, never a node, so the nodes are not offered.
export function ruleOutbounds(groups: Array<{name: string}>, t: Translator): SearchSection[] {
  const names = [...new Set(groups.map(group => group.name))].filter(name => !isBuiltinOutbound(name));
  return [
    {id: 'builtin', title: t('policy.pickBuiltin'), items: builtinOutboundNames.map(id => ({id, label: id}))},
    {id: 'groups', title: t('policy.pickGroups'), items: names.map(id => ({id, label: id}))}
  ].filter(section => section.items.length);
}
// The actions a new DNS rule can take, first the keywords and then the upstreams: a request rule sends the query to an
// upstream, to its original destination or answers it empty; a response rule keeps or empties the answer, or resolves
// the query again through an upstream. An upstream is written as its key is, quotes included, and shown without them.
export function dnsActions(list: DnsRuleListId, upstreams: string[], t: Translator) {
  const names = upstreams.map(id => ({id, label: unquote(id), ...(list === 'response' ? {desc: t('rule.dns.action.requery')} : {})}));
  return list === 'request'
    ? [...names, {id: 'asis', label: 'asis', desc: t('rule.dns.action.asis')}, {id: 'reject', label: 'reject', desc: t('rule.dns.action.rejectQuery')}]
    : [{id: 'accept', label: 'accept', desc: t('rule.dns.action.accept')}, {id: 'reject', label: 'reject', desc: t('rule.dns.action.rejectAnswer')}, ...names];
}
// The upstream that answered, as the configuration names it, when exactly one upstream has that name or address. The
// configuration writes an address with its port and the log without, so addresses compare by scheme and host.
export function answeredUpstream(upstreams: Array<{name: string; address: string | null}>, answered: string | null | undefined): string | null {
  if (!answered) return null;
  const host = endpoint(answered);
  const found = upstreams.filter(
    upstream => unquote(upstream.name).toLowerCase() === answered.toLowerCase() || (upstream.address !== null && endpoint(upstream.address) === host)
  );
  return found.length === 1 ? found[0].name : null;
}
// What the add-rule dialog says beside its choices. `current` is what happens to the item now: the outbound the traffic
// took, or the upstream that answered a DNS request when the configuration names exactly that one; a cache hit or a
// response names none. A routing rule to the current outbound changes nothing, so the dialog says so; for DNS the
// upstream is only context, since the rule may still change which queries reach it. `beforeMatched` holds when the rule
// goes before the rule the traffic matched, which only a verified, writable match offers.
export function quickRuleContext({
  list,
  seed,
  upstreams,
  outbound,
  position
}: {
  list: RuleList;
  seed: QuickRuleSeed;
  upstreams: Array<{name: string; address: string | null}>;
  outbound: string;
  position: {matched: boolean} | undefined;
}): {current: string | null; unchanged: boolean; beforeMatched: boolean} {
  const routing = list === 'routing';
  const current = routing ? seed.outbound || null : list === 'request' ? answeredUpstream(upstreams, seed.dns?.upstream) : null;
  return {current, unchanged: routing && !!current && outbound === current, beforeMatched: routing && !!position?.matched};
}
const endpoint = (address: string) => (/^[a-z][\w+.-]*:\/\/(?:\[[^\]]*\]|[^/:?#]*)/i.exec(address)?.[0] ?? address).toLowerCase();

// Why the add-rule dialog cannot write: the configuration cannot be written at all, the rules, sources or groups it
// needs are still being read, or no outbound (for a DNS rule, no action) is chosen. Null while it can write, while a
// write is in flight, or when a failed read or a missing position is already shown in the dialog.
export function ruleDialogReason(
  {
    readOnly,
    waiting,
    outbound,
    busy,
    failed,
    unplaceable,
    dns = false
  }: {readOnly: boolean; waiting: boolean; outbound: boolean; busy: boolean; failed: boolean; unplaceable: boolean; dns?: boolean},
  t: Translator
): string | null {
  if (readOnly) return t('rule.copyOnly');
  if (busy || failed || unplaceable) return null;
  return waiting ? t('ui.loading') : outbound ? null : t(dns ? 'rule.dns.actionMissing' : 'rule.outboundMissing');
}
