import {useCapabilities} from '../../store';
import {offered} from '../../api/capabilities';
import type {PageProps} from '../../shell/routes';
import {quickRuleQuery} from './link';
import {ruleLists, type QuickRuleSeed} from './rule';

export type {QuickRuleSeed} from './rule';
export function useQuickRule(go: PageProps['go']) {
  const resources = useCapabilities().data?.resources;
  const dns = offered(resources, 'dns_rules', {whileLoading: false});
  const lists = (seed: QuickRuleSeed) => ruleLists(seed, dns);
  return {
    canAdd: (seed: QuickRuleSeed) => lists(seed).length > 0,
    open: (seed: QuickRuleSeed) => {
      const list = lists(seed)[0];
      if (list) go('rules', quickRuleQuery(seed, list));
    }
  };
}
