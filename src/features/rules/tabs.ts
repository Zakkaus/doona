import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';

export type RuleTab = 'list' | 'dns' | 'trace';
// The editable rule lists come first, routing and then DNS, then the trace that checks them. The DNS rules are offered
// only once the capabilities say so, which the Skeleton does not wait for.
export const allRuleTabs: ReadonlyArray<{id: RuleTab; titleKey: Key}> = [
  {id: 'list', titleKey: 'rule.listTitle'},
  {id: 'dns', titleKey: 'rule.dnsTitle'},
  {id: 'trace', titleKey: 'rule.trace'}
];
export function rulesTabs(resources: Capabilities['resources'] | undefined): Array<{id: RuleTab; titleKey: Key}> {
  const shown: Record<RuleTab, boolean> = {
    list: offered(resources, 'flows', {whileLoading: true}) || offered(resources, 'rules', {whileLoading: false}),
    dns: offered(resources, 'dns_rules', {whileLoading: false}),
    trace: offered(resources, 'routing_trace', {whileLoading: true})
  };
  return allRuleTabs.filter(tab => shown[tab.id]);
}
