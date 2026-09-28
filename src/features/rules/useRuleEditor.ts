import {useEffect, useEffectEvent, useRef, useState} from 'react';
import {useConfigEditor} from '../../store';
import {useT} from '../../i18n';
import type {ConfigSource, RuleSource} from '../../api/model';
import {toast, toastFailure} from '../../ui/ui';
import {ruleCondition, type RuleConditionKind} from '../../dae/groups';
import {addRule, removeRule, replaceRuleTarget, type RuleAnchor} from '../../dae/ruleText';
import type {RuleSeed} from '../shared/link';
import {addRuleReason, addRuleTip, removalView, ruleDraftView, type ReasonKeys, type RuleDraftView} from './view';
import {useDraftGuard} from '../../shell/draft';

// A rule of either list as the editor needs it: GET /rules and GET /dns/rules entries share these fields.
export type EditedRule = {rule_id: string; kind: 'rule' | 'fallback'; expression: string; source: RuleSource | null};
// An edit changes only what the rule routes to; `outbound` and `must` are its current target.
type Opened<R> = {kind: 'add'; preset?: RuleSeed} | {kind: 'remove'; rule: R} | {kind: 'edit'; rule: R; outbound: string; must: boolean};
type Dialog<R> = Opened<R> & {
  generation: string;
  sources: ConfigSource[];
  rules: R[];
};
export type RuleForm = {condition: string; outbound: string; must: boolean; before: string};
export type RulePick = {on: boolean; kind: RuleConditionKind; value: string};
export type RuleEditorModel = {
  canWrite: boolean;
  busy: boolean;
  addDisabled: boolean;
  addTip: string | undefined;
  // Why Add rule is disabled, shown under it; another change being applied is left to the tip.
  addReason: string | null;
  editHelp: string | null;
  dialog: {kind: 'add'} | {kind: 'remove'; expression: string; help: string} | {kind: 'edit'; expression: string} | null;
  dialogTitle: string;
  submitLabel: string;
  close: () => void;
  openAdd: () => void;
  openRemove: (id: string) => void;
  submit: (dismiss: () => void) => Promise<void>;
  form: RuleForm;
  setForm: (form: RuleForm) => void;
  pick: RulePick;
  setPick: (pick: RulePick) => void;
  draft: RuleDraftView;
  submitDisabled: boolean;
  submitReason: string | null;
  changeMode: (mode: string) => void;
};
export type RuleEditorOptions<R extends EditedRule> = {
  canWrite: boolean;
  // The listed rules and the configuration they were read with; an edit needs both from one generation.
  list: {rules: R[]; generation_id: string} | undefined;
  config: {sources: ConfigSource[]; generation_id: string} | undefined;
  retry: () => void;
  // Insertion points, by rule ID or `end` for before the fallback.
  positions: Array<{id: string}>;
  // What a new rule targets first: an outbound, or a DNS action or upstream.
  target: string;
  anchor: (source: ConfigSource, rule: R) => RuleAnchor | null;
  // Where a rule goes at the end of a list whose fallback is not written, if anywhere.
  end?: (sources: ConfigSource[]) => {source: ConfigSource; anchor: RuleAnchor} | null;
  kinds: readonly RuleConditionKind[];
  reasons?: ReasonKeys;
  // What Cancel does beyond closing the dialog, such as dropping a navigation's seed.
  onClose?: () => void;
  // A dialog a link opens, named by `key`; `open` is null until the rule it names is read.
  link?: {key: string | null; open: Opened<R> | null};
};

// The add and remove dialogs of a rule list, which write by splicing one line into the source that holds the rule
// and replacing that source whole.
export function useRuleEditor<R extends EditedRule>({
  canWrite,
  list,
  config,
  retry,
  positions,
  target,
  anchor,
  end,
  kinds,
  reasons,
  onClose,
  link
}: RuleEditorOptions<R>) {
  const t = useT();
  const editor = useConfigEditor(retry);
  const report = useEffectEvent((error: Error) => toastFailure(error, t, t('ui.writeFailed')));
  useEffect(() => {
    if (editor.error) report(editor.error);
  }, [editor.error]);
  const [dialog, setDialog] = useState<Dialog<R> | null>(null);
  const pending = useRef(false);
  const [form, setForm] = useState<RuleForm>({condition: '', outbound: '', must: false, before: 'end'});
  const [pick, setPick] = useState<RulePick>({on: true, kind: kinds[0], value: ''});
  const condition = pick.on ? ruleCondition(pick.kind, pick.value) : form.condition.trim();
  const guard = useDraftGuard(dialog?.kind === 'add' && !!(pick.value.trim() || form.condition.trim()), () => setDialog(null));
  const rules: R[] = list?.rules ?? [];
  const sources = config?.sources ?? [];
  const stale = () => {
    toast('negative', t('rule.stale'));
    retry();
  };
  const initialize = (next: Opened<R>) => {
    if (editor.busy || !list) return;
    const edit = next.kind === 'edit' ? next : null;
    setForm({condition: '', outbound: edit?.outbound ?? target, must: edit?.must ?? false, before: positions[0]?.id ?? 'end'});
    setPick({on: true, kind: kinds[0], value: '', ...(next.kind === 'add' ? next.preset : {})});
    setDialog({...next, generation: list.generation_id, sources, rules});
  };
  // A link opens its dialog once the list and sources are read in one generation; a refresh must not open it again.
  const [linked, setLinked] = useState<{key: string | null; consumed: boolean}>({key: null, consumed: false});
  const current = linked.key === (link?.key ?? null) ? linked : {key: link?.key ?? null, consumed: false};
  if (current !== linked) setLinked(current);
  if (
    !current.consumed &&
    link?.open &&
    canWrite &&
    list &&
    config &&
    list.generation_id === config.generation_id &&
    (link.open.kind !== 'add' || positions.length)
  ) {
    setLinked({...current, consumed: true});
    initialize(link.open);
  }
  const open = (next: Opened<R>) => {
    if (pending.current) return;
    if (list?.generation_id !== config?.generation_id) {
      stale();
      return;
    }
    initialize(next);
  };
  // Cancel while a write is pending abandons it; the write may still land, so the rules and sources are read again.
  const close = () => {
    if (pending.current) {
      editor.cancel();
      pending.current = false;
      retry();
    }
    guard.clear();
    setDialog(null);
    onClose?.();
  };
  const write = async (source: ConfigSource, transform: (text: string) => string | null) => {
    const result = await editor.apply(source, text => {
      const next = transform(text);
      if (next === null) stale();
      return next;
    });
    if (!result) return false;
    if (result.diagnostics) {
      toast('negative', t('ui.writeInvalid', {n: result.diagnostics.filter(d => d.level === 'error').length}));
      return false;
    }
    return true;
  };
  const submit = async (dismiss: () => void) => {
    if (pending.current) return;
    // Both writes address a line the dialog saw in one generation; a reload since then means starting over.
    if (!dialog || !list || !config || list.generation_id !== dialog.generation || config.generation_id !== dialog.generation) {
      stale();
      return;
    }
    const rule =
      dialog.kind !== 'add' ? dialog.rule : dialog.rules.find(rule => (form.before === 'end' ? rule.kind === 'fallback' : rule.rule_id === form.before));
    const appended = dialog.kind === 'add' && form.before === 'end' && !rule?.source ? (end?.(dialog.sources) ?? null) : null;
    const source = appended?.source ?? dialog.sources.find(source => source.id === rule?.source?.source_id);
    const at = appended?.anchor ?? (source && rule ? anchor(source, rule) : null);
    if (condition === null) return;
    if (!source || !at) {
      stale();
      return;
    }
    pending.current = true;
    try {
      const written = await write(source, text =>
        dialog.kind === 'remove'
          ? removeRule(text, at)
          : dialog.kind === 'edit'
            ? replaceRuleTarget(text, at, form.outbound, form.must)
            : addRule(text, at, condition, form.outbound, form.must)
      );
      if (written) {
        toast('positive', t(dialog.kind === 'remove' ? 'rule.removed' : dialog.kind === 'edit' ? 'rule.edited' : 'rule.added'));
        pending.current = false;
        dismiss();
      }
    } finally {
      pending.current = false;
    }
  };
  const draft = ruleDraftView(pick.kind, pick.value, pick.on, condition, form.condition, t, kinds);
  const dialogView =
    dialog?.kind === 'remove'
      ? {kind: 'remove' as const, ...removalView(dialog.rule, sources, t)}
      : dialog?.kind === 'edit'
        ? {kind: 'edit' as const, expression: dialog.rule.expression}
        : dialog && {kind: dialog.kind};
  const noPosition = !!list && !!config && !positions.length;
  const model: RuleEditorModel = {
    canWrite,
    busy: !!editor.busy,
    addDisabled: !positions.length || !!editor.busy,
    addTip: addRuleTip(noPosition, !!editor.busy, t),
    addReason: addRuleTip(noPosition, false, t) ?? null,
    editHelp: canWrite && sources.some(source => source.writable && source.content === undefined) ? t('config.incomplete') : null,
    dialog: dialogView,
    dialogTitle: t(dialog?.kind === 'remove' ? 'rule.removeTitle' : dialog?.kind === 'edit' ? 'rule.edit' : 'rule.add'),
    submitLabel: t(dialog?.kind === 'remove' ? 'rule.remove' : dialog?.kind === 'edit' ? 'rule.edit' : 'rule.add'),
    close,
    openAdd: () => {
      if (list) open({kind: 'add'});
    },
    openRemove: (id: string) => {
      const rule = rules.find(rule => rule.rule_id === id);
      if (rule && list) open({kind: 'remove', rule});
    },
    submit,
    form,
    setForm: (next: RuleForm) => {
      if (!pending.current) setForm(next);
    },
    pick,
    setPick: (next: RulePick) => {
      if (!pending.current) setPick(next);
    },
    draft,
    submitDisabled: dialog?.kind === 'add' ? !draft.valid || !form.outbound : dialog?.kind === 'edit' && !form.outbound,
    submitReason: dialog?.kind === 'add' && !editor.busy ? addRuleReason(draft, form.outbound, t, reasons) : null,
    changeMode: (mode: string) => {
      if (pending.current) return;
      if (mode === 'text' && pick.on && pick.value.trim() && condition) setForm({...form, condition});
      setPick({...pick, on: mode === 'pick'});
    }
  };
  return {model};
}
