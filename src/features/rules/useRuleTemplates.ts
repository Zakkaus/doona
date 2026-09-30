import {useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useNodes, useVersion} from '../../store';
import {useCompleteness} from '../../store/config';
import {useT} from '../../i18n';
import {ApiError} from '../../api/error';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import type {ConfigSource} from '../../api/model';
import {toast, toastFailure, type DiffRow} from '../../ui/ui';
import {allGroupNames, fileName} from '../../dae/sources';
import {writeTemplate} from '../../dae/setup';
import type {RuleTemplate} from '../../dae/templates';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {lineDiff} from './diff';
import {
  refusalReason,
  templateChoice,
  templateImpact,
  templatesView,
  templateTarget,
  type TemplateChoice,
  type TemplateImpact,
  type TemplatesView
} from './template';

export type RuleViewMode = 'simple' | 'advanced';
// A template being confirmed, over the file as it was read when the dialog opened: that text is what the write's
// If-Match names, so a change on disk since is refused rather than overwritten.
type Pending = {choice: TemplateChoice; source: ConfigSource; after: string; impact: TemplateImpact; diff: DiffRow[]};
export type RuleTemplatesModel = TemplatesView & {
  // Whether the routing list offers the simple view: it reads the rules from the configuration text.
  available: boolean;
  mode: RuleViewMode;
  setMode: (mode: string) => void;
  // The file a template would be written to.
  file: string | null;
  // The chosen template: the detected one until another is picked, and none for custom routing.
  selected: RuleTemplate | null;
  select: (id: RuleTemplate) => void;
  // Why no template can be applied, or null when one can; applying waits while the file's digest is checked.
  refusal: string | null;
  // Whether the chosen template can be applied: it differs from the detected one and the file can be written.
  canApply: boolean;
  open: () => void;
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
  // A new group named like a node takes that name over, so the impact names the nodes it would shadow.
  const nodes = useNodes(readable && offered(resources, 'nodes', {whileLoading: false}));
  const editor = useConfigEditor(config.refetch, {rethrow: true});
  const [denied, setDenied] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Pending | null>(null);
  const [picked, setPicked] = useState<RuleTemplate | null>(null);
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
  const selected = picked ?? view.current?.id ?? null;
  const canApply = !!selected && selected !== view.current?.id && !target.refusal && !!target.source && isComplete(target.source) === true && !editor.busy;
  return {
    ...view,
    available: readable && !!config.data,
    mode: asked === 'simple' || asked === 'advanced' ? asked : view.current ? 'simple' : 'advanced',
    setMode,
    file: target.source && fileName(target.source),
    selected,
    select: setPicked,
    refusal: target.refusal && refusalReason(target.refusal, target.source, t),
    canApply,
    open: () => {
      const source = target.source;
      if (!canApply || !source || !selected) return;
      const before = source.content!;
      const after = writeTemplate(before, selected, allGroupNames(sources));
      setDialog({
        choice: templateChoice(selected, t),
        source,
        after,
        impact: templateImpact(
          selected,
          source,
          sources,
          (nodes.data ?? []).map(node => node.name)
        ),
        diff: lineDiff(before, after).map(line => (line.kind === 'gap' ? {kind: 'gap', text: t('rule.template.unchanged', {n: line.count})} : line))
      });
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
        setPicked(null);
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
