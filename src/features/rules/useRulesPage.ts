import {useCapabilities} from '../../store';
import {useT} from '../../i18n';
import type {PageProps} from '../../shell/routes';
import {rulesView} from './view';
import {tabQuery} from '../../shell/route';
import {offered} from '../../api/capabilities';
import {useFlowDemand} from '../../store/events';

export function useRulesPage({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const view = rulesView(capabilities.data?.resources, query, t);
  // Flow records exist only while a client asks for them, and the tabs' `/flows` polls pause in a hidden browser tab.
  useFlowDemand(offered(capabilities.data?.resources, 'flows', {whileLoading: false}) && capabilities.data?.resources.events.available === true);
  return {
    ...view,
    loading: capabilities.loading && !capabilities.data,
    error: capabilities.error,
    retry: capabilities.refetch,
    changeTab: (tab: string) => go('rules', tabQuery(query, tab, view.fallback))
  };
}
