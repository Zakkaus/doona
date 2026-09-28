import {useCapabilities, useConfig, useRules} from '../../store';
import type {Connection} from '../../api/model';
import {offered} from '../../api/capabilities';
import {sourceIp} from '../../api/selectors';
import {ruleWritable} from '../shared/rule';
import {useQuickRule, type QuickRuleSeed} from '../shared/useQuickRule';

// What a connection tells the add-rule dialog.
export const connectionSeed = (c: Connection): QuickRuleSeed => ({
  domain: c.domain ?? null,
  dip: sourceIp(c.dst) ?? null,
  sip: sourceIp(c.src) ?? null,
  outbound: c.outbound,
  matched: c.rule_id
});

// The rule actions of the shown connection: adding one through the shared dialog, and showing or editing the rule it
// matched. The rules and sources are read while a connection that matched a rule is shown, to tell whether that rule
// can be edited. `review` opens the held rules.
export function useConnectionRule(connection: Connection | undefined, review: () => void) {
  const resources = useCapabilities().data?.resources;
  const quick = useQuickRule(review);
  const canWrite =
    offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const matched = canWrite ? (connection?.rule_id ?? null) : null;
  const rules = useRules(!!matched);
  const config = useConfig(!!matched);
  const seed = connection && connectionSeed(connection);
  return {
    canAdd: !!seed && quick.canAdd(seed),
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
