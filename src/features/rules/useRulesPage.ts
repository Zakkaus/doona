import {useCapabilities} from '../../api/store';
import {useT} from '../../i18n';
import type {PageProps} from '../types';
import {rulesView} from './view';

export function useRulesPage({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const params = new URLSearchParams(query);
  return {
    ...rulesView(capabilities.data?.resources, params.get('tab'), t),
    loading: capabilities.loading && !capabilities.data,
    error: capabilities.error,
    changeTab: (tab: string) => {
      const next = new URLSearchParams(query);
      next.set('tab', tab);
      go('rules', next.toString());
    }
  };
}
