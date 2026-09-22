import {useCapabilities} from '../../store';
import {useT} from '../../i18n';
import type {PageProps} from '../types';
import {rulesView} from './view';
import {within} from '../../shell/route';

export function useRulesPage({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  return {
    ...rulesView(capabilities.data?.resources, query, t),
    loading: capabilities.loading && !capabilities.data,
    error: capabilities.error,
    changeTab: (tab: string) => go('rules', within(query, {tab}))
  };
}
