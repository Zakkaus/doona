import {useCapabilities, useConfig, useRules} from '../../store';
import type {Connection} from '../../api/model';
import {offered} from '../../api/capabilities';
import {sourceIp} from '../../api/selectors';
import {useT} from '../../i18n';
import {ruleTargets, ruleWritable} from '../shared/rule';
import {useQuickRule, type QuickRuleSeed} from '../shared/useQuickRule';

// What a connection tells the add-rule dialog. The rule it matched counts only when the backend recorded the match.
export const connectionSeed = (c: Connection): QuickRuleSeed => ({
  domain: c.domain ?? null,
  dip: sourceIp(c.dst) ?? null,
  sip: sourceIp(c.src) ?? null,
  outbound: c.outbound,
  matched: c.rule_id && c.rule_source !== 'unknown' ? {id: c.rule_id, expression: c.rule_expression} : null
});

// The rule actions of the shown connection: adding one through the shared dialog, and showing or editing the rule it
// matched. The rules and sources are read while a connection that matched a rule is shown, to tell whether that rule
// can be edited. `review` opens the held rules.
export function useConnectionRule(connection: Connection | undefined, review: () => void) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const quick = useQuickRule(review);
  const canWrite =
    offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const matched = canWrite ? (connection?.rule_id ?? null) : null;
  const rules = useRules(!!matched);
  const config = useConfig(!!matched);
  const seed = connection && connectionSeed(connection);
  return {
    canWrite: quick.canWrite,
    canAdd: !!seed && quick.canAdd(seed),
    // Why the list toolbar's Add rule, which acts on the selected connection, cannot open.
    addTip: !seed ? t('conn.ruleSelect') : !ruleTargets(seed).length ? t('conn.ruleNoTarget') : undefined,
    // Showing the matched rule only reads the rule list.
    canShow: offered(resources, 'rules', {whileLoading: false}) && !!connection?.rule_id,
    canEdit:
      !!matched &&
      ruleWritable(
        rules.data?.rules.find(rule => rule.rule_id === matched),
        config.data?.sources ?? []
      ),
    openAdd: () => {
      if (seed) quick.open(seed);
    },
    dialog: quick.dialog
  };
}
