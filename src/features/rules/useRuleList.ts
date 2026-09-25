import {useEffect, useEffectEvent, useMemo, useRef, useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useConfigEditor, useFlows, useGroups, usePendingRules, useRules} from '../../store';
import {pendingView} from './pending';
import {useLang, useT} from '../../i18n';
import type {ConfigSource, RoutingRule} from '../../api/model';
import {toast, toastFailure} from '../../ui/ui';
import {ruleCondition, type ConditionKind} from '../../dae/groups';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {addRule, removeRule, ruleAnchor} from './source';
import {parseRuleSeed, type RuleSeed} from './link';
import {dictionaryView, distributionView, removalView, ruleDraftView, type DictionaryView, type DistributionView, type RuleDraftView} from './view';
import {useDraftGuard} from '../../shell/draft';
import {offered} from '../../api/capabilities';

const noDictionary: DictionaryView = {rows: [], caption: null, positions: [], outbounds: []};
const noDistribution: DistributionView = {rows: [], choices: [], caption: null, coverage: null, droppedUnknown: false};
type Dialog = ({kind: 'add'} | {kind: 'remove'; rule: RoutingRule}) & {
  generation: string;
  sources: ConfigSource[];
  rules: RoutingRule[];
};
type RuleForm = {condition: string; outbound: string; must: boolean; before: string};
type RulePick = {on: boolean; kind: ConditionKind; value: string};
export type RuleListModel = {
  kind: 'dictionary' | 'distribution';
  table: DictionaryView;
  distribution: DistributionView;
  source: string;
  setSource: (source: string) => void;
  selected: string | null;
  select: (row: string | null) => void;
  held: ReturnType<typeof pendingView>;
  discard: (id: number) => void;
  canWrite: boolean;
  busy: boolean;
  addDisabled: boolean;
  editHelp: string | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  dialog: {kind: 'add'} | {kind: 'remove'; expression: string; help: string} | null;
  dialogTitle: string;
  submitLabel: string;
  close: () => void;
  openAdd: () => void;
  openRemove: (id: string) => void;
  openSource: (query: string) => void;
  submit: (dismiss: () => void) => Promise<void>;
  form: RuleForm;
  setForm: (form: RuleForm) => void;
  pick: RulePick;
  setPick: (pick: RulePick) => void;
  draft: RuleDraftView;
  submitDisabled: boolean;
  changeMode: (mode: string) => void;
};
export function useRuleList({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const resources = useCapabilities().data?.resources;
  const dictionary = offered(resources, 'rules', {whileLoading: false});
  const rules = useRules(dictionary);
  const flows = useFlows({}, offered(resources, 'flows', {whileLoading: true}));
  const groups = useGroups(dictionary && offered(resources, 'groups', {whileLoading: false}));
  const canWrite = dictionary && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const config = useConfig(canWrite);
  const retry = () => {
    config.refetch();
    rules.refetch();
  };
  const editor = useConfigEditor(retry);
  const report = useEffectEvent((error: Error) => toastFailure(error, t, error => t('ui.writeFailed', {error})));
  useEffect(() => {
    if (editor.error) report(editor.error);
  }, [editor.error]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const pending = useRef(false);
  const [form, setForm] = useState({condition: '', outbound: '', must: false, before: 'end'});
  const [pick, setPick] = useState<{on: boolean; kind: ConditionKind; value: string}>({on: true, kind: 'domainSuffix', value: ''});
  const condition = pick.on ? ruleCondition(pick.kind, pick.value) : form.condition.trim();
  const guard = useDraftGuard(dialog?.kind === 'add' && !!(pick.value.trim() || form.condition.trim()), () => setDialog(null));
  const list: RoutingRule[] = rules.data?.rules ?? [];
  const sources = config.data?.sources ?? [];
  const params = new URLSearchParams(query);
  const landed = params.get('rule');
  const [picked, setPicked] = useState<{landed: string | null; row: string | null}>({landed, row: landed});
  const selected = picked.landed === landed ? picked.row : landed;
  const [source, setSource] = useState('all');
  // Only one of the two views renders, so only that one is projected.
  const table = useMemo(
    () =>
      dictionary
        ? dictionaryView(rules.data?.rules ?? [], rules.data?.generation_id, flows.data, config.data?.sources ?? [], groups.data ?? [], t, lang)
        : noDictionary,
    [dictionary, rules.data, flows.data, config.data, groups.data, t, lang]
  );
  const distribution = useMemo(() => (dictionary ? noDistribution : distributionView(flows.data, source, t, lang)), [dictionary, flows.data, source, t, lang]);
  const stale = () => {
    toast('negative', t('rule.stale'));
    retry();
  };
  const initialize = (next: {kind: 'add'} | {kind: 'remove'; rule: RoutingRule}, preset?: RuleSeed) => {
    if (editor.busy || !rules.data) return;
    setForm({condition: '', outbound: groups.data?.[0]?.name ?? 'direct', must: false, before: table.positions[0]?.id ?? 'end'});
    setPick({on: true, kind: 'domainSuffix', value: '', ...preset});
    setDialog({...next, generation: rules.data.generation_id, sources, rules: list});
  };
  const open = (next: {kind: 'add'} | {kind: 'remove'; rule: RoutingRule}) => {
    if (pending.current) return;
    if (rules.data?.generation_id !== config.data?.generation_id) {
      stale();
      return;
    }
    initialize(next);
  };
  const seed = params.get('add');
  const parsedSeed = useMemo(() => parseRuleSeed(seed), [seed]);
  // Resource refreshes must not consume or reset a navigation's seed.
  const [consumption, setConsumption] = useState<{seed: string | null; consumed: boolean}>({seed, consumed: false});
  const current = consumption.seed === seed ? consumption : {seed, consumed: false};
  if (consumption.seed !== seed) setConsumption(current);
  if (
    !current.consumed &&
    parsedSeed &&
    canWrite &&
    rules.data &&
    config.data &&
    rules.data.generation_id === config.data.generation_id &&
    table.positions.length
  ) {
    setConsumption({seed, consumed: true});
    initialize({kind: 'add'}, parsedSeed);
  }
  // Cancel while a write is pending abandons it; the write may still land, so the rules and sources are read again.
  const close = () => {
    if (pending.current) {
      editor.cancel();
      pending.current = false;
      retry();
    }
    guard.clear();
    setDialog(null);
    if (seed) go('rules', within(query, {add: null}));
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
    if (!dialog || !rules.data || !config.data || rules.data.generation_id !== dialog.generation || config.data.generation_id !== dialog.generation) {
      stale();
      return;
    }
    const rule =
      dialog.kind === 'remove' ? dialog.rule : dialog.rules.find(rule => (form.before === 'end' ? rule.kind === 'fallback' : rule.rule_id === form.before));
    const source = dialog.sources.find(source => source.id === rule?.source?.source_id);
    const anchor = source && rule ? ruleAnchor(source, rule) : null;
    if (condition === null) return;
    if (!source || !anchor) {
      stale();
      return;
    }
    pending.current = true;
    try {
      const written = await write(source, text =>
        dialog.kind === 'remove' ? removeRule(text, anchor) : addRule(text, anchor, condition, form.outbound, form.must)
      );
      if (written) {
        toast('positive', t(dialog.kind === 'remove' ? 'rule.removed' : 'rule.added'));
        pending.current = false;
        dismiss();
      }
    } finally {
      pending.current = false;
    }
  };
  const draft = ruleDraftView(pick.kind, pick.value, pick.on, condition, form.condition, t);
  const held = usePendingRules();
  const dialogView = dialog?.kind === 'remove' ? {kind: 'remove' as const, ...removalView(dialog.rule, sources, t)} : dialog;
  return {
    kind: dictionary ? ('dictionary' as const) : ('distribution' as const),
    table,
    distribution,
    source,
    setSource,
    selected,
    select: (row: string | null) => setPicked({landed, row}),
    held: pendingView(held.rules, held.failure, t),
    discard: (id: number) => pendingRules.remove([id]),
    canWrite,
    busy: !!editor.busy,
    addDisabled: !table.positions.length || !!editor.busy,
    editHelp: canWrite && sources.some(source => source.writable && source.content === undefined) ? t('config.incomplete') : null,
    loading: dictionary ? rules.loading && !rules.data : flows.loading && !flows.data,
    error: dictionary ? (rules.error ?? config.error) : flows.error,
    retry: dictionary ? retry : flows.refetch,
    dialog: dialogView,
    dialogTitle: t(dialog?.kind === 'remove' ? 'rule.removeTitle' : 'rule.add'),
    submitLabel: t(dialog?.kind === 'remove' ? 'rule.remove' : 'rule.add'),
    close,
    openAdd: () => {
      if (rules.data) open({kind: 'add'});
    },
    openRemove: (id: string) => {
      const rule = list.find(rule => rule.rule_id === id);
      if (rule && rules.data) open({kind: 'remove', rule});
    },
    openSource: (query: string) => go('config', query),
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
    submitDisabled: dialog?.kind !== 'remove' && (!draft.valid || !form.outbound),
    changeMode: (mode: string) => {
      if (pending.current) return;
      if (mode === 'text' && pick.on && pick.value.trim() && condition) setForm({...form, condition});
      setPick({...pick, on: mode === 'pick'});
    }
  };
}
