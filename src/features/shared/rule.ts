import type {ConfigSource, DnsLogRecord, DnsRoutingRule, RoutingRule} from '../../api/model';
import {ruleCondition, type RuleConditionKind} from '../../dae/groups';
import type {Key, Translator} from '../../i18n';
import type {PendingRule} from '../../store';
import {dnsUpstreams, ruleAnchor, type DnsRuleListId, type RuleAnchor} from '../../dae/ruleText';
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
  matched: {id: string; expression: string | null} | null;
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
  dip: 'rule.kind.dip',
  geoip: 'rule.kind.geoip',
  sip: 'rule.kind.sip',
  dport: 'rule.kind.dport',
  sport: 'rule.kind.sport',
  pname: 'rule.kind.pname',
  l4proto: 'rule.kind.l4proto',
  qnameSuffix: 'rule.kind.domainSuffix',
  qnameFull: 'rule.kind.domain',
  qnameKeyword: 'rule.dns.kind.keyword',
  qnameGeosite: 'rule.kind.geosite',
  qtype: 'rule.dns.kind.qtype',
  upstream: 'rule.dns.kind.upstream',
  answerIp: 'rule.dns.kind.answerIp',
  answerGeoip: 'rule.dns.kind.answerGeoip'
};
// The list a quick rule goes into: the routing rules, or one of the two DNS lists.
export type RuleList = PendingRule['list'];

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

// Whether doona can locate the rule in a writable source, which placing a rule beside it or editing it needs.
export function ruleWritable(rule: RoutingRule | undefined, sources: ConfigSource[]): boolean {
  const source = rule && sources.find(source => source.id === rule.source?.source_id);
  return !!source?.writable && ruleAnchor(source, rule!) !== null;
}

// The end of a DNS list that writes no fallback, as a position: last in the list, or first in a new block when the list
// has none.
export function dnsEndPosition(anchor: RuleAnchor | undefined, list: DnsRuleListId, t: Translator): {label: string; desc: string | undefined} {
  return anchor?.open
    ? {label: t('rule.dns.positionNew', {name: list}), desc: t('rule.dns.positionNewHelp', {name: list})}
    : {label: t('rule.positionLast'), desc: undefined};
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
const endpoint = (address: string) => (/^[a-z][\w+.-]*:\/\/(?:\[[^\]]*\]|[^/:?#]*)/i.exec(address)?.[0] ?? address).toLowerCase();
// What a successful rule write toasts. It is shown once the reload has settled, so the change is in effect, but a
// connection already open keeps the route it was given until it reconnects.
export function ruleWritten(key: 'rule.added' | 'rule.edited' | 'rule.removed' | 'rule.applied', t: Translator, n?: number) {
  return {text: n === undefined ? t(key) : t(key, {n}), detail: t('rule.keepsRoute')};
}
