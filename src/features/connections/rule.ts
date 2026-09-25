import type {ConfigSource, Connection, RoutingRule} from '../../api/model';
import {sourceIp} from '../../api/selectors';
import {ruleCondition, type ConditionKind} from '../../dae/groups';
import type {Translator} from '../../i18n';
import {ruleAnchor} from '../rules/source';

export type RuleTarget = {kind: ConditionKind; condition: string};
// A domain is matched exactly or with its subdomains; without one that dae can hold, the rule matches the destination IP.
export function ruleTargets(c: Pick<Connection, 'domain' | 'dst'>): RuleTarget[] {
  const targets = (seeds: Array<[ConditionKind, string]>) =>
    seeds.flatMap(([kind, value]) => {
      const condition = ruleCondition(kind, value);
      return condition ? [{kind, condition}] : [];
    });
  const domain = c.domain
    ? targets([
        ['domain', c.domain],
        ['domainSuffix', c.domain]
      ])
    : [];
  const ip = sourceIp(c.dst);
  return domain.length ? domain : ip ? targets([['dip', ip]]) : [];
}

// Before the rule the connection matched, so the new rule takes over its traffic, and at the earliest place doona
// can write: before the first rule, or the first one in a writable source when earlier ones are not. Only a rule doona
// can locate in a writable source is offered; the first choice is the default.
export function rulePositions(rules: RoutingRule[], sources: ConfigSource[], matched: string | null, t: Translator) {
  const anchored = (rule: RoutingRule) => {
    const source = sources.find(source => source.id === rule.source?.source_id);
    return !!source?.writable && ruleAnchor(source, rule) !== null;
  };
  const hit = rules.find(rule => rule.rule_id === matched && anchored(rule));
  const top = rules.find(anchored);
  const topLabel = (rule: RoutingRule) => (rule === rules[0] ? t('conn.ruleTop') : t('rule.positionBefore', {n: rule.index + 1}));
  return [...(hit ? [{rule: hit, label: t('conn.ruleBeforeMatched')}] : []), ...(top && top !== hit ? [{rule: top, label: topLabel(top)}] : [])].map(
    ({rule, label}) => ({id: rule.rule_id, label, desc: rule.expression})
  );
}

// The position a dialog pinned while its rule still exists: the same id in the same generation, or the same id and
// text after a reload. Otherwise the first position, reported as moved so the dialog says so before writing there.
export function pinnedPosition(positions: Array<{id: string; desc: string}>, pin: {generation: string; rule: RoutingRule} | null, generation?: string) {
  if (!pin) return {before: positions[0]?.id, moved: false};
  const kept = positions.find(position => position.id === pin.rule.rule_id && (generation === pin.generation || position.desc === pin.rule.expression));
  return kept ? {before: kept.id, moved: false} : {before: positions[0]?.id, moved: true};
}
