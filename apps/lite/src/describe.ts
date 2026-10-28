// Plain-language descriptions of dae group filters, rule conditions and rule targets.
// The functions return message keys and values; phraseText turns a phrase into text for one catalog.
import {parseConditionValues, parseGroupConditions} from '../../../src/dae/groupConditions';
import {exactTokens, nestedIn} from '../../../src/dae/groups';
import {unquote} from '../../../src/dae/text';
import {EMPTY_GROUP_FILTER, readSubscriptionBinding, regexLiterals} from './groupBindings';
import {regionLabel} from './regions';
import type {GroupChange} from './groupDraft';
import type {MessageKey} from './i18n';
import type {Messages} from './i18n/en';

type PhraseList = {items: string[]; join: 'or' | 'sep'; quote?: boolean};
type PhraseParts = {parts: PhraseValue[]; join: 'and' | 'sep'};
type PhraseValue = string | Phrase | PhraseList | PhraseParts | {regions: string[]};
type Phrase = {key: MessageKey; values?: Record<string, PhraseValue>};
type DescribedCondition = {kind: string; value: string; negate: boolean};

const phrase = (key: MessageKey, values?: Record<string, PhraseValue>): Phrase => ({key, values});
const names = (items: string[]): PhraseList => ({items, join: 'sep'});
const nodeNames = (items: string[]): PhraseParts => ({parts: items.map(describeTarget), join: 'sep'});
const quoted = (items: string[]): PhraseList => ({items, join: 'or', quote: true});

const listOf = (value: string) => parseConditionValues(value) ?? [value];

// One group filter line. Null for the empty-group placeholder.
export function describeGroupFilter(filter: string): Phrase | null {
  const text = filter.trim();
  if (text === EMPTY_GROUP_FILTER) return null;
  const binding = readSubscriptionBinding(text);
  if (binding?.regions.length)
    return phrase(binding.words.length ? 'descSourceRegionsContains' : 'descSourceRegions', {
      source: binding.source,
      regions: {regions: binding.regions},
      list: quoted(binding.words)
    });
  if (exactTokens(text, 'group') !== null) return phrase('descGroups', {names: names(nestedIn({filters: [text]}))});
  const rows = parseGroupConditions(text);
  if (!rows) return phrase('descCustom');
  const sources: string[] = [];
  const nodes: string[] = [];
  const contains: string[] = [];
  const subscriptionContains: string[] = [];
  const excludedNames: string[] = [];
  const excludedContains: string[] = [];
  let manual = false;
  let pattern = false;
  for (const row of rows) {
    if (row.alternatives?.length) {
      // `name(keyword: a, regex: b)`: alternatives of one call. Only keyword and literal regex alternatives read as text.
      const words = [row, ...row.alternatives].flatMap(term =>
        term.kind === 'nameKeyword' ? listOf(term.value) : term.kind === 'nameRegex' ? listOf(term.value).flatMap(value => regexLiterals(value) ?? []) : []
      );
      const all = [row, ...row.alternatives].every(term => term.kind === 'nameKeyword' || term.kind === 'nameRegex');
      if (!all || row.negate) return phrase('descCustom');
      if ([row, ...row.alternatives].some(term => term.kind === 'nameRegex' && listOf(term.value).some(value => !regexLiterals(value)))) pattern = true;
      else contains.push(...words);
      continue;
    }
    const values = listOf(row.value);
    switch (row.kind) {
      case 'group':
        return phrase('descGroups', {names: names(values)});
      case 'subtag':
        if (row.negate) return phrase('descCustom');
        sources.push(...values);
        break;
      case 'subtagRegex':
        if (row.negate && values.length === 1 && values[0] === '.*') manual = true;
        else return phrase('descCustom');
        break;
      case 'subtagKeyword':
        if (row.negate) return phrase('descCustom');
        subscriptionContains.push(...values);
        break;
      case 'nameExact':
        (row.negate ? excludedNames : nodes).push(...values);
        break;
      case 'nameKeyword':
        (row.negate ? excludedContains : contains).push(...values);
        break;
      case 'nameRegex': {
        const words = values.map(regexLiterals);
        if (words.some(item => !item)) {
          if (row.negate) return phrase('descCustom');
          pattern = true;
        } else (row.negate ? excludedContains : contains).push(...(words.flat() as string[]));
        break;
      }
      default:
        return phrase('descCustom');
    }
  }
  const source: PhraseValue | null = sources.length ? names(sources) : manual ? phrase('descManualSource') : null;
  let base: Phrase;
  if (nodes.length) base = source ? phrase('descSourceNodes', {source, names: nodeNames(nodes)}) : phrase('descNodes', {names: nodeNames(nodes)});
  else if (pattern) base = source ? phrase('descSourcePattern', {source}) : phrase('descPattern');
  else if (contains.length) base = source ? phrase('descSourceContains', {source, list: quoted(contains)}) : phrase('descContains', {list: quoted(contains)});
  else if (subscriptionContains.length && !source) base = phrase('descSubscriptionContains', {list: quoted(subscriptionContains)});
  else if (source) base = phrase('descSourceAll', {source});
  else if (excludedNames.length && !excludedContains.length) return phrase('descAllNodesExcept', {names: nodeNames(excludedNames)});
  else base = phrase('descAllNodes');
  if (excludedNames.length) base = phrase('descExcludeNames', {base, names: nodeNames(excludedNames)});
  if (excludedContains.length) base = phrase('descExclude', {base, list: quoted(excludedContains)});
  return base;
}

// Every filter line of a group; a group with no filter uses all nodes.
export function describeGroupFilters(filters: string[]): Phrase[] {
  if (!filters.length) return [phrase('descAllNodes')];
  const described = filters.map(describeGroupFilter).filter((item): item is Phrase => item !== null);
  return described.length ? described : [phrase('descNone')];
}

const policyKeys: Record<string, MessageKey> = {
  select: 'policyManual',
  selector: 'policyManual',
  fixed: 'policyManual',
  random: 'policyManual',
  min: 'policyManual',
  min_moving_avg10: 'policyManual',
  min_avg10: 'policyUrlTest',
  min_moving_avg: 'policyUrlTest',
  min_last_delay: 'policyUrlTest',
  urltest: 'policyUrlTest',
  fallback: 'policyFallback',
  roundrobin: 'policyBalance',
  round_robin: 'policyBalance',
  loadbalance: 'policyBalance',
  balance: 'policyBalance',
  score: 'policyScore'
};
// honk's group policies (honk-config parser/groups.rs, node.rs GroupPolicy): selector is a manual choice, urltest
// picks the lowest latency, loadbalance rotates across alive nodes, fallback keeps the first alive node in order,
// and score picks by real connection outcomes.
export function policyKey(keyword: string | null | undefined): MessageKey {
  return policyKeys[(keyword ?? 'select').split('(')[0].trim().toLowerCase()] ?? 'policyManual';
}

const geositeNames: Record<string, MessageKey> = {
  cn: 'geo_site_cn',
  gfw: 'geo_site_gfw',
  'category-ads-all': 'geo_site_ads',
  'category-ads': 'geo_site_ads',
  'google-cn': 'geo_site_google_cn',
  'category-games': 'geo_site_games',
  'category-games@cn': 'geo_site_games_cn',
  apple: 'geo_site_apple',
  microsoft: 'geo_site_microsoft',
  telegram: 'geo_site_telegram',
  openai: 'geo_site_openai',
  youtube: 'geo_site_youtube',
  netflix: 'geo_site_netflix',
  disney: 'geo_site_disney',
  spotify: 'geo_site_spotify',
  bilibili: 'geo_site_bilibili',
  netease: 'geo_site_netease',
  bahamut: 'geo_site_bahamut'
};
const geoValues: Record<string, Record<string, MessageKey>> = {
  geosite: geositeNames,
  qnameGeosite: geositeNames,
  geoip: {private: 'geo_ip_private', cn: 'geo_ip_cn'},
  answerGeoip: {private: 'geo_ip_private', cn: 'geo_ip_cn'}
};
const kindKeys = new Set([
  'domainSuffix',
  'domain',
  'domainKeyword',
  'domainRegex',
  'geosite',
  'dip',
  'geoip',
  'sip',
  'dport',
  'sport',
  'pname',
  'l4proto',
  'ipversion',
  'mac',
  'dscp',
  'qnameSuffix',
  'qnameFull',
  'qnameKeyword',
  'qnameGeosite',
  'qnameRegex',
  'qtype',
  'upstream',
  'answerIp',
  'answerGeoip'
]);

// Keep the field name so website categories and IP regions remain distinguishable.
export function describeCondition(condition: DescribedCondition): Phrase | PhraseParts {
  const values = parseConditionValues(condition.value) ?? [unquote(condition.value.trim())];
  const known = geoValues[condition.kind];
  const base = phrase('condValue', {
    kind: kindKeys.has(condition.kind) ? phrase(`kind_${condition.kind}` as MessageKey) : phrase('customRule'),
    values: {parts: values.map(value => (known?.[value] ? phrase(known[value]) : condition.kind === 'l4proto' ? value.toUpperCase() : value)), join: 'sep'}
  });
  return condition.negate ? phrase('condNegated', {cond: base}) : base;
}

// A rule target: built-in outbounds read as words, `x(must)` as "x (forced)".
export function describeTarget(target: string): PhraseValue {
  const must = /^(.*)\(must\)$/.exec(target.trim());
  const name = (must ? must[1] : target).trim();
  const builtIn: Record<string, MessageKey> = {direct: 'out_direct', block: 'out_block', reject: 'out_block', accept: 'out_accept', asis: 'out_asis'};
  const base: PhraseValue = builtIn[name] ? phrase(builtIn[name]) : name;
  return must ? phrase('mustTarget', {target: base}) : base;
}

// A whole rule, `conditions → target`. Null conditions are a rule kept as text.
export function describeRule(conditions: DescribedCondition[] | null, target: string): Phrase {
  const parts = conditions?.length ? conditions.map(describeCondition) : [phrase('customRule')];
  return phrase('ruleArrow', {conditions: {parts, join: 'and'}, target: describeTarget(target)});
}

const han = /\p{Script=Han}/u;
const latin = /[\p{Script=Latin}\p{Nd}]/u;
// Chinese text puts a space between Han characters and a Latin word or a number.
const gap = (a: string | undefined, b: string | undefined) => !!a && !!b && ((han.test(a) && latin.test(b)) || (latin.test(a) && han.test(b)));

export function phraseText(value: PhraseValue, t: Messages): string {
  if (typeof value === 'string') return value;
  if ('regions' in value) return value.regions.map(iso => regionLabel(iso, t.locale)).join(t.listSep);
  if ('items' in value) {
    const items = value.quote ? value.items.map(item => t.listQuote.replace('{v}', item)) : value.items;
    if (value.join === 'sep' || items.length < 2) return items.join(t.listSep);
    return `${items.slice(0, -1).join(t.listSep)}${t.listOr}${items.at(-1)}`;
  }
  if ('parts' in value) return value.parts.map(part => phraseText(part, t)).join(value.join === 'and' ? t.condAnd : t.listSep);
  const template = t[value.key];
  let out = '';
  let last = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const before = template.slice(last, match.index);
    const filled = value.values && match[1] in value.values ? phraseText(value.values[match[1]], t) : match[0];
    const next = template[match.index + match[0].length];
    out += before + (gap(out.concat(before).at(-1), filled[0]) ? ' ' : '') + filled + (gap(filled.at(-1), next) ? ' ' : '');
    last = match.index + match[0].length;
  }
  return out + template.slice(last);
}

// The groups review summary, one or two lines per change.
export const describeGroupChanges = (changes: GroupChange[]): Phrase[] => changes.flatMap(describeGroupChange);
function describeGroupChange(change: GroupChange): Phrase | Phrase[] {
  const members = (filters: string[]): PhraseParts => ({
    parts: filters.map(filter => describeGroupFilter(filter) ?? phrase('descNone')),
    join: 'sep'
  });
  switch (change.kind) {
    case 'added': {
      const filters = change.filters.filter(filter => filter.trim() !== EMPTY_GROUP_FILTER);
      const added = phrase('reviewGroupAdded', {name: change.name});
      if (change.filters.length && !filters.length) return added;
      return [added, phrase('reviewGroupMembersAdded', {name: change.name, members: filters.length ? members(filters) : phrase('descAllNodes')})];
    }
    case 'removed':
      return phrase('reviewGroupRemoved', {name: change.name});
    case 'renamed':
      return phrase('reviewGroupRenamed', {before: change.before, after: change.after});
    case 'policy':
      return phrase('reviewGroupPolicy', {name: change.name, policy: phrase(policyKey(change.policy))});
    case 'members': {
      const added = change.added.filter(filter => filter.trim() !== EMPTY_GROUP_FILTER);
      const removed = change.removed.filter(filter => filter.trim() !== EMPTY_GROUP_FILTER);
      if (added.length && !removed.length) return phrase('reviewGroupMembersAdded', {name: change.name, members: members(added)});
      if (removed.length && !added.length) return phrase('reviewGroupMembersRemoved', {name: change.name, members: members(removed)});
      if (!added.length && !removed.length) return phrase('reviewGroupMembersAdded', {name: change.name, members: phrase('descAllNodes')});
      return [
        phrase('reviewGroupMembersAdded', {name: change.name, members: members(added)}),
        phrase('reviewGroupMembersRemoved', {name: change.name, members: members(removed)})
      ];
    }
    case 'changed':
      return phrase('reviewGroupChanged', {name: change.name});
    default:
      return phrase('reviewOther');
  }
}
