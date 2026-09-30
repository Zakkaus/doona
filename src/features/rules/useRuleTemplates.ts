import {useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useVersion} from '../../store';
import {useCompleteness} from '../../store/config';
import {useT} from '../../i18n';
import {ApiError} from '../../api/error';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import type {ConfigSource} from '../../api/model';
import {toast, toastFailure} from '../../ui/ui';
import {allGroupNames, fileName} from '../../dae/sources';
import {writeTemplate} from '../../dae/setup';
import type {RuleTemplate} from '../../dae/templates';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {refusalReason, templateChoice, templatesView, templateTarget, type TemplateChoice, type TemplatesView} from './template';

export type RuleViewMode = 'simple' | 'advanced';
// A template being confirmed, over the file as it was read when the dialog opened: that text is what the write's
// If-Match names, so a change on disk since is refused rather than overwritten.
type Pending = {choice: TemplateChoice; source: ConfigSource; before: string; after: string};
export type RuleTemplatesModel = TemplatesView & {
  // Whether the routing list offers the simple view: it reads the rules from the configuration text.
  available: boolean;
  mode: RuleViewMode;
  setMode: (mode: string) => void;
  // Why no template can be applied, or null when one can; applying waits while the file's digest is checked.
  refusal: string | null;
  canApply: boolean;
  open: (id: RuleTemplate) => void;
  dialog: (Pending & {file: string}) | null;
  close: () => void;
  confirm: () => Promise<void>;
  applying: boolean;
};
// The routing list's simple view: the template the routing holds, in plain words, and the templates to replace it with.
// It opens on the simple view when the routing holds a template and on the rule table otherwise.
export function useRuleTemplates({go, query}: PageProps): RuleTemplatesModel {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const readable = offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false});
  const config = useConfig(readable);
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const view = useMemo(() => templatesView(sources, t), [sources, t]);
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  const isComplete = useCompleteness(sources);
  const editor = useConfigEditor(config.refetch, {rethrow: true});
  const [denied, setDenied] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Pending | null>(null);
  const target = templateTarget({
    sources,
    configWritable: resources?.config.writable === true,
    daeText: engine.daeText,
    complete: isComplete,
    holdsCredentials: source => engine.holdsCredentials(source),
    denied
  });
  const asked = new URLSearchParams(query).get('view');
  const setMode = (mode: string) => go('rules', within(query, {view: mode}));
  const canApply = !target.refusal && !!target.source && isComplete(target.source) === true && !editor.busy;
  return {
    ...view,
    available: readable && !!config.data,
    mode: asked === 'simple' || asked === 'advanced' ? asked : view.current ? 'simple' : 'advanced',
    setMode,
    refusal: target.refusal && refusalReason(target.refusal, target.source, t),
    canApply,
    open: id => {
      const source = target.source;
      if (!canApply || !source) return;
      const before = source.content!;
      setDialog({choice: templateChoice(id, t), source, before, after: writeTemplate(before, id, allGroupNames(sources))});
    },
    dialog: dialog && {...dialog, file: fileName(dialog.source)},
    close: () => {
      editor.cancel();
      setDialog(null);
    },
    confirm: async () => {
      if (!dialog) return;
      try {
        const outcome = await editor.apply(dialog.source, dialog.after);
        if (!outcome) return;
        if (outcome.diagnostics) {
          toast('negative', t('ui.writeInvalid', {n: outcome.diagnostics.filter(item => item.level === 'error').length}));
          return;
        }
        toast('positive', t('rule.template.applied', {name: dialog.choice.name, file: fileName(dialog.source)}));
        setDialog(null);
        go('rules', within(query, {view: 'simple'}));
      } catch (error) {
        // honk answers 403 when the sign-in lacks control permission or the file sets API listener settings.
        if (error instanceof ApiError && error.status === 403) setDenied(dialog.source.id);
        setDialog(null);
        toastFailure(error, t, t('ui.writeFailed'));
      }
    },
    applying: editor.busy === 'save'
  };
}
