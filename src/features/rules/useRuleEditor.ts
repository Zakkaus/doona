import {useEffect, useEffectEvent, useRef, useState} from 'react';
import {useConfigEditor} from '../../store';
import {useT} from '../../i18n';
import type {ConfigSource, RuleSource} from '../../api/model';
import {toast, toastFailure} from '../../ui/ui';
import {parseConditions, serializeConditions, type RuleConditionRow} from '../../dae/conditions';
import type {RuleConditionKind} from '../../dae/groups';
import {addFallback, addRule, removeRule, replaceRule, type RuleAnchor} from '../../dae/ruleText';
import type {RuleSeed} from '../shared/link';
import {ruleWritten} from '../shared/rule';
import {addRuleReason, addRuleTip, removalView, ruleDraftView, type ReasonKeys, type RuleDraftView} from './view';
import {useDraftGuard} from '../../shell/draft';

// A rule of either list as the editor needs it: GET /rules and GET /dns/rules entries share these fields.
export type EditedRule = {rule_id: string; kind: 'rule' | 'fallback'; expression: string; source: RuleSource | null};
// An edit starts from the located source condition and the listed target.
export type Opened<R> = {kind: 'add'; preset?: RuleSeed} | {kind: 'remove'; rule: R} | {kind: 'edit'; rule: R; outbound: string; must: boolean};
type Dialog<R> = Opened<R> & {
  generation: string;
  sources: ConfigSource[];
  rules: R[];
};
export type RuleForm = {condition: string; outbound: string; must: boolean; before: string};
export type RuleEditorModel = {
  canWrite: boolean;
  busy: boolean;
  addDisabled: boolean;
  addTip: string | undefined;
  // Why Add rule is disabled, shown under it; another change being applied is left to the tip.
  addReason: string | null;
  dialog: {kind: 'add'} | {kind: 'remove'; expression: string; help: string} | {kind: 'edit'; expression: string; fallback: boolean} | null;
  dialogTitle: string;
  submitLabel: string;
  close: () => void;
  openAdd: () => void;
  openRemove: (id: string) => void;
  submit: (dismiss: () => void) => Promise<void>;
  form: RuleForm;
  setForm: (form: RuleForm) => void;
  conditions: Array<RuleConditionRow & {id: number; draft: RuleDraftView}> | null;
  setCondition: (id: number, row: RuleConditionRow) => void;
  addCondition: () => void;
  removeCondition: (id: number) => void;
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

// The dialogs of a rule list, which write by splicing one line into the source that holds the rule
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
  const [pick, setPick] = useState(true);

  const [conditions, setConditions] = useState<Array<RuleConditionRow & {id: number}> | null>(null);
  const [originalCondition, setOriginalCondition] = useState('');
  const [initialRows, setInitialRows] = useState('');
  const editing = dialog?.kind === 'edit';
  const fallback = editing && dialog.rule.kind === 'fallback';
  const visual = editing ? conditions !== null : pick;
  const serialized = conditions ? serializeConditions(conditions) : null;
  const condition = visual ? (editing && serialized === initialRows ? originalCondition : serialized) : form.condition.trim();
  const drafted =
    dialog?.kind === 'add'
      ? !!(conditions?.some(row => row.value.trim()) || form.condition.trim())
      : dialog?.kind === 'edit' && (condition !== originalCondition || form.outbound !== dialog.outbound || form.must !== dialog.must);
  const guard = useDraftGuard(drafted, () => setDialog(null));
  const rules: R[] = list?.rules ?? [];
  const sources = config?.sources ?? [];
  const stale = () => {
    toast('negative', t('rule.stale'));
    retry();
  };
  const initialize = (next: Opened<R>) => {
    if (editor.busy || !list) return;
    const edit = next.kind === 'edit' ? next : null;
    const source = edit && sources.find(source => source.id === edit.rule.source?.source_id);
    const at = source && edit ? anchor(source, edit.rule) : null;
    const raw = at?.condition && source ? source.content.slice(at.condition.from, at.condition.to) : '';
    const parsed =
      next.kind === 'add'
        ? [{kind: next.preset?.kind ?? kinds[0], value: next.preset?.value ?? '', negate: false}]
        : edit && edit.rule.kind !== 'fallback'
          ? parseConditions(raw, kinds)
          : null;
    const rows = parsed?.map((row, id) => ({...row, id})) ?? null;
    setConditions(rows);
    setInitialRows(serializeConditions(rows ?? []) ?? '');
    setOriginalCondition(raw);
    setForm({condition: raw, outbound: edit?.outbound ?? target, must: edit?.must ?? false, before: positions[0]?.id ?? 'end'});
    setPick(true);
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
    const appended =
      ((dialog.kind === 'add' && form.before === 'end') || (dialog.kind === 'edit' && rule?.kind === 'fallback')) && !rule?.source
        ? (end?.(dialog.sources) ?? null)
        : null;
    const source = appended?.source ?? dialog.sources.find(source => source.id === rule?.source?.source_id);
    const at = appended?.anchor ?? (source && rule ? anchor(source, rule) : null);
    if (dialog.kind !== 'remove' && !fallback && (condition === null || !condition.trim())) return;
    if (!canWrite || !source?.writable || !at) {
      stale();
      return;
    }
    pending.current = true;
    try {
      const written = await write(source, text =>
        dialog.kind === 'remove'
          ? removeRule(text, at)
          : dialog.kind === 'edit'
            ? appended
              ? addFallback(text, at, form.outbound)
              : replaceRule(text, at, condition ?? '', form.outbound, form.must)
            : addRule(text, at, condition!, form.outbound, form.must)
      );
      if (written) {
        const notice = ruleWritten(dialog.kind === 'remove' ? 'rule.removed' : dialog.kind === 'edit' ? 'rule.edited' : 'rule.added', t);
        toast('positive', notice.text, {detail: notice.detail});
        pending.current = false;
        dismiss();
      }
    } finally {
      pending.current = false;
    }
  };
  const conditionRows = conditions?.map(row => ({...row, draft: ruleDraftView(row.kind, row.value, true, serializeConditions([row]), '', t, kinds)})) ?? null;
  const first = conditions?.[0];
  const rawDraft = ruleDraftView(first?.kind ?? kinds[0], first?.value ?? '', visual, condition, form.condition, t, kinds);
  const draft =
    visual && conditionRows
      ? {...rawDraft, valid: conditionRows.every(row => row.draft.valid), pickError: conditionRows.find(row => !row.draft.valid)?.draft.pickError}
      : rawDraft;
  const editValid = fallback || (conditionRows ? conditionRows.every(row => row.draft.valid) : condition === originalCondition || draft.valid);
  const dialogView =
    dialog?.kind === 'remove'
      ? {kind: 'remove' as const, ...removalView(dialog.rule, sources, t)}
      : dialog?.kind === 'edit'
        ? {kind: 'edit' as const, expression: dialog.rule.expression, fallback: dialog.rule.kind === 'fallback'}
        : dialog && {kind: dialog.kind};
  const noPosition = !!list && !!config && !positions.length;
  const model: RuleEditorModel = {
    canWrite,
    busy: !!editor.busy,
    addDisabled: !positions.length || !!editor.busy,
    addTip: addRuleTip(noPosition, !!editor.busy, t),
    addReason: addRuleTip(noPosition, false, t) ?? null,
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
    conditions: conditionRows,
    setCondition: (id, row) => {
      if (!pending.current)
        setConditions(current => current?.map(item => (item.id === id ? {id, kind: row.kind, value: row.value, negate: row.negate} : item)) ?? null);
    },
    addCondition: () => {
      if (!pending.current)
        setConditions(current => [...(current ?? []), {id: Math.max(-1, ...(current ?? []).map(row => row.id)) + 1, kind: kinds[0], value: '', negate: false}]);
    },
    removeCondition: id => {
      if (!pending.current) setConditions(current => (current && current.length > 1 ? current.filter(row => row.id !== id) : current));
    },
    draft,
    submitDisabled: dialog?.kind === 'add' ? !draft.valid || !form.outbound : dialog?.kind === 'edit' && (!form.outbound || !editValid),
    submitReason:
      !editor.busy && (dialog?.kind === 'add' || (editing && !fallback))
        ? addRuleReason(editing ? {...draft, valid: editValid} : draft, form.outbound, t, reasons)
        : null,
    changeMode: (mode: string) => {
      if (pending.current) return;
      if (mode === 'text' && pick && condition) setForm({...form, condition});
      setPick(mode === 'pick');
    }
  };
  // `open` lets each list start an edit with its own target vocabulary.
  return {model, open};
}
