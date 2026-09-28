import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';

export type RuleTab = 'list' | 'dns' | 'map' | 'flows' | 'trace';
// The editable rule lists come first, routing and then DNS, then the views of observed traffic.
export function rulesTabs(resources: Capabilities['resources'] | undefined): Array<{id: RuleTab; titleKey: Key}> {
  const flows = offered(resources, 'flows', {whileLoading: true});
  const rules = offered(resources, 'rules', {whileLoading: false});
  return [
    ...(flows || rules ? [{id: 'list' as const, titleKey: 'rule.listTitle' as const}] : []),
    ...(offered(resources, 'dns_rules', {whileLoading: false}) ? [{id: 'dns' as const, titleKey: 'rule.dnsTitle' as const}] : []),
    ...(flows ? [{id: 'map' as const, titleKey: 'rule.map' as const}] : []),
    ...(flows ? [{id: 'flows' as const, titleKey: 'rule.flows' as const}] : []),
    ...(offered(resources, 'routing_trace', {whileLoading: true}) ? [{id: 'trace' as const, titleKey: 'rule.trace' as const}] : [])
  ];
}
