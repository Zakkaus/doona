import {useCapabilities, useFlowDemand} from '../../store';
import {useT} from '../../i18n';
import type {PageProps} from '../../shell/routes';
import {tabQuery, within} from '../../shell/route';
import {rulesView} from './view';

export function useRulesPage({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const view = rulesView(capabilities.data?.resources, query, t);
  // Flow records exist only while a client asks for them, and the rule list counts its hits in them.
  useFlowDemand(capabilities.data?.resources);
  return {
    ...view,
    loading: capabilities.loading && !capabilities.data,
    error: capabilities.error,
    retry: capabilities.refetch,
    changeTab: (tab: string) => go('rules', tabQuery(within(query, {view: null}), tab, view.fallback))
  };
}
