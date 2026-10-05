import {useMemo, useState} from 'react';
import {refetchAll, useCapabilities, useConfig, useConfigEditor, useNodes, useVersion} from '../../store';
import {useCompleteness} from '../../store/config';
import {useT} from '../../i18n';
import {ApiError} from '../../api/error';
import {offered} from '../../api/capabilities';
import {engineOf} from '../../api/engines';
import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {diagnosticMessage, oneLine} from '../../i18n/backend';
import {refusalDetails} from '../shared/pending';
import {toast, toastFailure} from '../../ui/ui';
import {fileName} from '../../dae/sources';
import type {RuleTemplate, TemplateOptions} from '../../dae/templates';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {
  refusalReason,
  ruleViewMode,
  templateChoice,
  templateImpact,
  templatesView,
  templateTarget,
  templateWrites,
  templateOptionKeys,
  templateOptionText,
  type RuleViewMode,
  type TemplateChoice,
  type TemplateImpact,
  type TemplateWrite,
  type TemplatesView
} from './template';

// A template being confirmed, over the file as it was read when the dialog opened: that text is what the write's
// If-Match names, so a change on disk since is refused rather than overwritten. `withDns` is the same write with the
// DNS split appended, offered while the configuration has no `dns` block.
type Pending = {
  options: TemplateOptions;
  optionImpact: string[];
  choice: TemplateChoice;
  source: ConfigSource;
  impact: TemplateImpact;
  plain: TemplateWrite;
  withDns: TemplateWrite | null;
};
// `invalid` is the backend's refusal of the last Apply, one line per error, kept in the dialog until the write changes.
type Dialog = Omit<Pending, 'plain' | 'withDns'> & TemplateWrite & {file: string; dns: boolean | null; invalid: {id: number; errors: string[]} | null};
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
  setOption: (option: keyof TemplateOptions, enabled: boolean) => void;
  // Why no template can be applied, or null when one can; applying waits while the file's digest is checked.
  refusal: string | null;
  // Whether the template or its options differ from the detected routing and the file can be written.
  canApply: boolean;
  open: () => void;
  // `dns` is whether the DNS split is added, or null when the configuration already has a `dns` block.
  dialog: Dialog | null;
  setDns: (add: boolean) => void;
  close: () => void;
  confirm: () => Promise<void>;
  applying: boolean;
};
// A write changes the rules, and the groups and DNS rules a template brings, besides the file: every resource on show is
// read again, so the table the view switch opens holds the new rules and its generation even with no event stream.
const reread = () => void refetchAll();
// The routing list's simple view: the template the routing holds, in plain words, and the templates to replace it with.
// It opens on the simple view, template or custom, and on the rule table for a link to a rule.
export function useRuleTemplates({go, query}: PageProps): RuleTemplatesModel {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const readable = offered(resources, 'config', {whileLoading: false});
  const config = useConfig(readable);
  const sources = useMemo(() => config.data?.sources ?? [], [config.data]);
  const view = useMemo(() => templatesView(sources, t), [sources, t]);
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  const isComplete = useCompleteness(sources);
  // A new group named like a node takes that name over, so the impact names the nodes it would shadow.
  const nodes = useNodes(readable && offered(resources, 'nodes', {whileLoading: false}));
  const editor = useConfigEditor(reread, {rethrow: true});
  const [denied, setDenied] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Pending | null>(null);
  const [pickedOptions, setPickedOptions] = useState<Partial<TemplateOptions>>({});
  const [picked, setPicked] = useState<RuleTemplate | null>(null);
  const [addDns, setAddDns] = useState(true);
  const [invalid, setInvalid] = useState<{id: number; errors: ConfigDiagnostic[]} | null>(null);
  // A refusal keeps the dialog open with its errors, from the check before the write or from the write itself, which
  // alone checks a file other than the main one.
  const refuse = (diagnostics: ConfigDiagnostic[]) =>
    setInvalid(current => ({id: (current?.id ?? 0) + 1, errors: diagnostics.filter(item => item.level === 'error')}));
  const target = templateTarget({
    sources,
    configWritable: resources?.config.writable === true,
    daeText: engine.daeText,
    complete: isComplete,
    holdsCredentials: source => engine.holdsCredentials(source),
    denied
  });
  const setMode = (mode: string) => go('rules', within(query, {view: mode}));
  const selected = picked ?? view.current?.id ?? null;
  const options: TemplateOptions = {blockAds: view.blockAds, blockQuic: view.blockQuic, networkManagerDirect: view.networkManagerDirect, ...pickedOptions};
  const applying = editor.busy === 'save';
  const canApply =
    !!selected &&
    (selected !== view.current?.id || templateOptionKeys.some(key => options[key] !== view[key])) &&
    !target.refusal &&
    !!target.source &&
    isComplete(target.source) === true &&
    !editor.busy;
  return {
    ...view,
    ...options,
    setOption: (option, enabled) => setPickedOptions(current => ({...current, [option]: enabled})),
    available: readable && engine.daeText && !!config.data,
    mode: ruleViewMode(query),
    setMode,
    file: target.source && fileName(target.source),
    selected,
    select: setPicked,
    refusal: target.refusal && refusalReason(target.refusal, target.source, t),
    canApply,
    open: () => {
      const source = target.source;
      if (!canApply || !source || !selected) return;
      setAddDns(true);
      setInvalid(null);
      setDialog({
        options,
        optionImpact: templateOptionKeys
          .filter(key => view.current && options[key] !== view[key])
          .map(key => t(templateOptionText[key][options[key] ? 'on' : 'off'])),
        choice: templateChoice(selected, t),
        source,
        impact: templateImpact(
          selected,
          source,
          sources,
          (nodes.data ?? []).map(node => node.name),
          t
        ),
        ...templateWrites(selected, source, sources, t, options)
      });
    },
    dialog: dialog && {
      options: dialog.options,
      optionImpact: dialog.optionImpact,
      choice: dialog.choice,
      source: dialog.source,
      impact: dialog.impact,
      ...(dialog.withDns && addDns ? dialog.withDns : dialog.plain),
      file: fileName(dialog.source),
      dns: dialog.withDns ? addDns : null,
      invalid: invalid && {
        id: invalid.id,
        // As the configuration editor lists them: a line in the file being written, another file by name.
        errors: invalid.errors.map(item => {
          const message = oneLine(diagnosticMessage(item, t), t);
          if (item.source_id === dialog.source.id) return item.line === null ? message : t('config.atLine', {line: item.line, message});
          const other = sources.find(source => source.id === item.source_id);
          const file = other ? fileName(other) : item.source_id;
          return item.line === null ? t('ui.valuePair', {label: file, value: message}) : t('config.atFile', {file, line: item.line, message});
        })
      }
    },
    // The write already holds the choice made before Apply, so the checkbox stays put until it settles.
    setDns: add => {
      if (applying) return;
      setAddDns(add);
      setInvalid(null);
    },
    close: () => {
      editor.cancel();
      setInvalid(null);
      setDialog(null);
    },
    confirm: async () => {
      if (!dialog) return;
      const {after} = dialog.withDns && addDns ? dialog.withDns : dialog.plain;
      try {
        const outcome = await editor.apply(dialog.source, after);
        if (!outcome) return;
        if (outcome.diagnostics) {
          refuse(outcome.diagnostics);
          return;
        }
        toast('positive', t('rule.template.applied', {name: dialog.choice.name, file: fileName(dialog.source)}));
        setDialog(null);
        setPicked(null);
        setPickedOptions({});
        go('rules', within(query, {view: 'simple'}));
      } catch (error) {
        const refused = refusalDetails(error)?.diagnostics;
        if (refused?.some(item => item.level === 'error')) {
          refuse(refused);
          return;
        }
        // honk answers 403 when the sign-in lacks control permission or the file sets API listener settings.
        if (error instanceof ApiError && error.status === 403) setDenied(dialog.source.id);
        setDialog(null);
        toastFailure(error, t, t('ui.writeFailed'));
      }
    },
    applying
  };
}
