import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';
import type {SearchTarget} from '../../shell/routes';

export type RuleTab = 'list' | 'dns' | 'trace';
// The editable rule lists come first, routing and then DNS, then the trace that checks them.
export function rulesTabs(resources: Capabilities['resources'] | undefined): Array<{id: RuleTab; titleKey: Key}> {
  const flows = offered(resources, 'flows', {whileLoading: true});
  const rules = offered(resources, 'rules', {whileLoading: false});
  return [
    ...(flows || rules ? [{id: 'list' as const, titleKey: 'rule.listTitle' as const}] : []),
    ...(offered(resources, 'dns_rules', {whileLoading: false}) ? [{id: 'dns' as const, titleKey: 'rule.dnsTitle' as const}] : []),
    ...(offered(resources, 'routing_trace', {whileLoading: true}) ? [{id: 'trace' as const, titleKey: 'rule.trace' as const}] : [])
  ];
}

// The rule editors and the routing modes, for search; editing needs a writable configuration.
export function rulesTargets(resources: Capabilities['resources'] | undefined): SearchTarget[] {
  const tabs = rulesTabs(resources).map(tab => tab.id);
  const routing = tabs.includes('list') && offered(resources, 'rules', {whileLoading: false}) && resources?.config.writable === true;
  return [
    ...(routing
      ? [
          {
            id: 'rules:add',
            titleKey: 'rule.add',
            parentKey: 'rule.listTitle',
            route: 'rules',
            params: {tab: 'list', view: 'advanced'},
            aliases: ['condition']
          } as const,
          {
            id: 'rules:modes',
            titleKey: 'rule.template.mode',
            parentKey: 'rule.listTitle',
            route: 'rules',
            params: {tab: 'list', view: 'simple'},
            aliases: ['template']
          } as const
        ]
      : []),
    ...(tabs.includes('dns') && resources?.config.writable === true
      ? [{id: 'rules:dns-add', titleKey: 'rule.add', parentKey: 'rule.dnsTitle', route: 'rules', params: {tab: 'dns'}, aliases: ['dns condition']} as const]
      : [])
  ];
}
