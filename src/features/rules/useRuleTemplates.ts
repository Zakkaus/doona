import {useMemo} from 'react';
import {useCapabilities, useConfig} from '../../store';
import {useT} from '../../i18n';
import {offered} from '../../api/capabilities';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {templatesView, type TemplatesView} from './template';

export type RuleViewMode = 'simple' | 'advanced';
export type RuleTemplatesModel = TemplatesView & {
  // Whether the routing list offers the simple view: it reads the rules from the configuration text.
  available: boolean;
  mode: RuleViewMode;
  setMode: (mode: string) => void;
};
// The routing list's simple view: the template the routing holds, in plain words, and the templates to choose from.
// It opens on the simple view when the routing holds a template and on the rule table otherwise.
export function useRuleTemplates({go, query}: PageProps): RuleTemplatesModel {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const readable = offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false});
  const config = useConfig(readable);
  const view = useMemo(() => templatesView(config.data?.sources ?? [], t), [config.data, t]);
  const asked = new URLSearchParams(query).get('view');
  return {
    ...view,
    available: readable && !!config.data,
    mode: asked === 'simple' || asked === 'advanced' ? asked : view.current ? 'simple' : 'advanced',
    setMode: mode => go('rules', within(query, {view: mode}))
  };
}
