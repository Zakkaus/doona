import {useCapabilities} from '../../store';
import {useT} from '../../i18n';
import type {PageProps} from '../types';
import {rulesView} from './view';
import {tabQuery} from '../../shell/route';

export function useRulesPage({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const view = rulesView(capabilities.data?.resources, query, t);
  return {
    ...view,
    loading: capabilities.loading && !capabilities.data,
    error: capabilities.error,
    changeTab: (tab: string) => go('rules', tabQuery(query, tab, view.tabs[0]?.id ?? 'map'))
  };
}
