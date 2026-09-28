import type {ConfigSource, RoutingRule} from '../../api/model';
import {ruleCondition, type ConditionKind} from '../../dae/groups';
import type {Translator} from '../../i18n';
import type {PendingRule} from '../../store';
import {ruleAnchor} from '../../dae/ruleText';

// What an origin knows about the traffic a new rule is for: its domain, destination and source IP, the outbound it
// took, and the rule it matched when the origin vouches for that match. Each page that offers the add-rule dialog turns
// its own item into one.
export type QuickRuleSeed = {
  domain: string | null;
  dip: string | null;
  sip: string | null;
  outbound: string | null;
  matched: {id: string; expression: string | null} | null;
};

export type RuleTarget = {kind: ConditionKind; condition: string};
// Every condition the seed allows, the default first: the exact domain, then its subdomains, the destination IP and the
// source IP, each address as one host. A value dae cannot hold is left out.
export function ruleTargets(seed: Pick<QuickRuleSeed, 'domain' | 'dip' | 'sip'>): RuleTarget[] {
  // A name as the resolver writes it ends in a dot, which a domain rule does not.
  const domain = seed.domain?.replace(/\.$/, '');
  const host = (ip: string | null) => ip && `${ip}/${ip.includes(':') ? 128 : 32}`;
  const seeds: Array<[ConditionKind, string | null | undefined]> = [
    ['domain', domain],
    ['domainSuffix', domain],
    ['dip', host(seed.dip)],
    ['sip', host(seed.sip)]
  ];
  return seeds.flatMap(([kind, value]) => {
    const condition = value ? ruleCondition(kind, value) : null;
    return condition ? [{kind, condition}] : [];
  });
}

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
export function rulePositions(rules: RoutingRule[], sources: ConfigSource[], matched: QuickRuleSeed['matched'], t: Translator) {
  const anchored = (rule: RoutingRule) => ruleWritable(rule, sources);
  const hit =
    matched &&
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

// Where the list already holds a rule with this condition and outbound, or a held rule does, as the dialog says it;
// null when neither does. The accepted rule is named first, since it already routes the traffic.
export function duplicateOf(rules: RoutingRule[], held: PendingRule[], condition: string, outbound: string, t: Translator): string | null {
  const key = conditionKey(condition);
  const listed = rules.find(rule => rule.kind === 'rule' && rule.outbound === outbound && conditionKey(rule.expression) === key);
  if (listed) return t('rule.duplicateListed', {n: listed.index + 1});
  return held.some(rule => rule.list === 'routing' && rule.outbound === outbound && conditionKey(rule.condition) === key) ? t('rule.duplicateHeld') : null;
}

// Whether doona can locate the rule in a writable source, which placing a rule beside it or editing it needs.
export function ruleWritable(rule: RoutingRule | undefined, sources: ConfigSource[]): boolean {
  const source = rule && sources.find(source => source.id === rule.source?.source_id);
  return !!source?.writable && ruleAnchor(source, rule!) !== null;
}

// The position a dialog pinned while its rule still exists: the same id in the same generation, or the same id and
// text after a reload. Otherwise the first position, reported as moved so the dialog says so before writing there.
export function pinnedPosition(positions: Array<{id: string; desc: string}>, pin: {generation: string; rule: RoutingRule} | null, generation?: string) {
  if (!pin) return {before: positions[0]?.id, moved: false};
  const kept = positions.find(position => position.id === pin.rule.rule_id && (generation === pin.generation || position.desc === pin.rule.expression));
  return kept ? {before: kept.id, moved: false} : {before: positions[0]?.id, moved: true};
}

// Why the add-rule dialog cannot write: the configuration cannot be written at all, the rules, sources or groups it
// needs are still being read, or no outbound is chosen. Null while it can write, while a write is in flight, or when a
// failed read or a missing position is already shown in the dialog.
export function ruleDialogReason(
  {
    readOnly,
    waiting,
    outbound,
    busy,
    failed,
    unplaceable
  }: {readOnly: boolean; waiting: boolean; outbound: boolean; busy: boolean; failed: boolean; unplaceable: boolean},
  t: Translator
): string | null {
  if (readOnly) return t('rule.copyOnly');
  if (busy || failed || unplaceable) return null;
  return waiting ? t('ui.loading') : outbound ? null : t('rule.outboundMissing');
}
