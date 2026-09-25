import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';

export type RuleTab = 'map' | 'list' | 'flows' | 'trace';
export function rulesTabs(resources: Capabilities['resources'] | undefined): Array<{id: RuleTab; titleKey: Key}> {
  const flows = offered(resources, 'flows', {whileLoading: true});
  const rules = offered(resources, 'rules', {whileLoading: false});
  return [
    ...(flows ? [{id: 'map' as const, titleKey: 'rule.map' as const}] : []),
    ...(flows || rules ? [{id: 'list' as const, titleKey: 'rule.listTitle' as const}] : []),
    ...(flows ? [{id: 'flows' as const, titleKey: 'rule.flows' as const}] : []),
    ...(offered(resources, 'routing_trace', {whileLoading: true}) ? [{id: 'trace' as const, titleKey: 'rule.trace' as const}] : [])
  ];
}
