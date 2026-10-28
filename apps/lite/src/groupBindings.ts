import type {Node, Provider} from '../../../src/api/model';
import {quote} from '../../../src/dae/text';
import {rustRegexToJs} from '../../../src/dae/rustRegex';
import {parseConditionValues, parseGroupConditions} from '../../../src/dae/groupConditions';
import {capitalOnlyRegionCodes, regions} from '../../../src/dae/regions';

// The filter a new group starts with; it admits nothing and is not a member.
export const EMPTY_GROUP_FILTER = "name(regex: '^$')";

// A regex containing only literal alternatives can be edited as words.
export function regexLiterals(pattern: string): string[] | null {
  const body = pattern.replace(/^\(\?i\)/, '');
  const parts = body.split('|');
  return parts.length && parts.every(part => part && !/[\\^$.*+?()[\]{}|]/.test(part)) ? parts : null;
}
export type Binding = {id: string; label: string; description: string; filter: string; provider?: string};
export function nodeBinding(node: Node, providers: Provider[], manual: string): Binding {
  const provider = providers.find(item => item.id === node.provider_id);
  const subscription = node.subscription_tag || (provider?.kind === 'subscription' ? provider.name : null);
  return {
    id: `node:${node.id}`,
    label: node.name || node.id,
    description: [node.protocol, subscription || manual].filter(Boolean).join(' / '),
    filter: `${subscription ? `subtag(${quote(subscription)}) && ` : "!subtag(regex: '.*') && "}name(${quote(node.name)})`
  };
}
export function subscriptionFilter(name: string, regex: string): string | null {
  if (regex && !rustRegexToJs(regex)) return null;
  return `subtag(${quote(name)})${regex ? ` && name(regex: ${quote(regex)})` : ''}`;
}
export function honkPolicy(value: string): string {
  const base = value.split('(')[0].trim().toLowerCase();
  if (['select', 'selector', 'fixed', 'random', 'min'].includes(base)) return 'select';
  if (['min_moving_avg', 'min_avg10', 'min_last_delay', 'urltest'].includes(base)) return 'urltest';
  if (['roundrobin', 'round_robin', 'loadbalance', 'balance'].includes(base)) return 'roundrobin';
  return ['fallback', 'score'].includes(base) ? base : 'select';
}

export function regionPatterns(iso: string): string[] {
  const entry = regions.find(([code]) => code === iso);
  if (!entry) return [];
  const capitalOnly = capitalOnlyRegionCodes[iso] === true;
  const keys = [...new Set([iso, ...entry[1]])];
  const han = keys.filter(key => /\p{Script=Han}/u.test(key));
  const latin = [...new Set(keys.filter(key => !han.includes(key) && !(capitalOnly && key.toUpperCase() === iso)).map(key => key.toLowerCase()))];
  const alternatives = (keys: string[]) =>
    keys
      .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
      .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
  const hanPattern = alternatives(han.filter(key => !han.some(other => other !== key && key.includes(other))));
  const start = String.raw`(?:^|[^\p{L}\p{M}])`;
  const end = String.raw`(?:[^\p{L}\p{M}]|$)`;
  const patterns = [`(?i)${start}(?:${alternatives(latin)})${end}${hanPattern ? `|${hanPattern}` : ''}`];
  if (capitalOnly) patterns.push(`${start}${iso}${end}`);
  return patterns;
}
const regionRegexes = regions.map(([iso]) => ({iso, patterns: regionPatterns(iso)}));

// Region patterns and case-sensitive keywords are alternatives within one subscription.
export function subscriptionBinding(name: string, regions: string[], words: string[]): string {
  const terms = [...regions.flatMap(regionPatterns).map(pattern => `regex: ${quote(pattern)}`), ...words.map(word => `keyword: ${quote(word)}`)];
  return `subtag(${quote(name)})${terms.length ? ` && name(${terms.join(', ')})` : ''}`;
}
export type SubscriptionBinding = {source: string; regions: string[]; words: string[]};
// Recognize generated region patterns, keywords, and older literal regex bindings.
export function readSubscriptionBinding(filter: string): SubscriptionBinding | null {
  const rows = parseGroupConditions(filter);
  if (!rows?.length || rows.length > 2 || rows[0].kind !== 'subtag' || rows[0].negate || rows[0].alternatives) return null;
  const source = parseConditionValues(rows[0].value);
  if (source?.length !== 1) return null;
  const binding: SubscriptionBinding = {source: source[0], regions: [], words: []};
  const rest = rows[1];
  if (!rest) return binding;
  if (rest.negate) return null;
  const terms = [rest, ...(rest.alternatives ?? [])].flatMap(term => (parseConditionValues(term.value) ?? []).map(value => ({kind: term.kind, value})));
  for (let i = 0; i < terms.length; i++) {
    const {kind, value} = terms[i];
    if (kind === 'nameKeyword') binding.words.push(value);
    else if (kind === 'nameRegex') {
      const region = regionRegexes.find(({patterns}) =>
        patterns.every((pattern, offset) => terms[i + offset]?.kind === 'nameRegex' && terms[i + offset].value === pattern)
      );
      if (region) {
        if (!binding.regions.includes(region.iso)) binding.regions.push(region.iso);
        i += region.patterns.length - 1;
      } else {
        const words = regexLiterals(value);
        if (!words) return null;
        binding.words.push(...words);
      }
    } else return null;
  }
  return binding;
}
