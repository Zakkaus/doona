import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useFlows, useGroups, useRules} from '../../api/store';
import {useLang, useT} from '../../i18n';
import type {ConfigSource, RoutingRule} from '../../api/model';
import {errorText, toast} from '../../ui/ui';
import {ruleCondition, type ConditionKind} from '../config/groups';
import type {PageProps} from '../types';
import {within} from '../../shell/route';
import {addRule, removeRule} from './source';
import {parseRuleSeed, type RuleSeed} from './seed';
import {dictionaryView, distributionView, removalView, ruleDraftView, type DictionaryView, type DistributionView, type RuleDraftView} from './view';
import {useDraftGuard} from '../config/useDraftGuard';
import {useLinked} from '../../ui/ui';

type Dialog = {kind: 'add'; generation: string} | {kind: 'remove'; rule: RoutingRule; source: ConfigSource; generation: string};
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
  canWrite: boolean;
  busy: boolean;
  addDisabled: boolean;
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
  const dictionary = resources?.rules.available === true;
  const rules = useRules(dictionary);
  const flows = useFlows({}, dictionary ? resources?.flows.available === true : true);
  const groups = useGroups(dictionary && resources?.groups.available === true);
  const canWrite = dictionary && resources?.config.available === true && resources.config.writable === true;
  const config = useConfig(canWrite);
  const retry = () => {
    config.refetch();
    rules.refetch();
  };
  const editor = useConfigEditor(retry);
  useEffect(() => {
    if (editor.error) toast('negative', errorText(editor.error));
  }, [editor.error]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState({condition: '', outbound: '', must: false, before: 'end'});
  const [pick, setPick] = useState<{on: boolean; kind: ConditionKind; value: string}>({on: true, kind: 'domainSuffix', value: ''});
  const condition = pick.on ? ruleCondition(pick.kind, pick.value) : form.condition.trim();
  const guard = useDraftGuard(dialog?.kind === 'add' && !!(pick.value.trim() || form.condition.trim()));
  useLinked(guard.revision, () => setDialog(null));
  const list: RoutingRule[] = rules.data?.rules ?? [];
  const sources = config.data?.sources ?? [];
  const params = new URLSearchParams(query);
  const landed = params.get('rule');
  const [picked, setPicked] = useState<{landed: string | null; row: string | null}>({landed, row: landed});
  const selected = picked.landed === landed ? picked.row : landed;
  const [source, setSource] = useState('all');
  const table = useMemo(
    () => dictionaryView(rules.data?.rules ?? [], rules.data?.generation_id, flows.data, config.data?.sources ?? [], groups.data ?? [], t, lang),
    [rules.data, flows.data, config.data, groups.data, t, lang]
  );
  const distribution = useMemo(() => distributionView(flows.data, source, t, lang), [flows.data, source, t, lang]);
  const stale = () => {
    toast('negative', t('rule.stale'));
    retry();
  };
  const initialize = (next: Dialog, preset?: RuleSeed) => {
    setForm({condition: '', outbound: groups.data?.[0]?.name ?? 'direct', must: false, before: table.positions[0]?.id ?? 'end'});
    setPick({on: true, kind: 'domainSuffix', value: '', ...preset});
    setDialog(next);
  };
  const open = (next: Dialog) => {
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
    initialize({kind: 'add', generation: rules.data.generation_id}, parsedSeed);
  }
  const close = () => {
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
      toast('negative', t('config.invalid', {n: String(result.diagnostics.filter(d => d.level === 'error').length)}));
      return false;
    }
    return true;
  };
  const submit = async (dismiss: () => void) => {
    // Both writes address a line the dialog saw in one generation; a reload since then means starting over.
    if (!dialog || !rules.data || !config.data || rules.data.generation_id !== dialog.generation || config.data.generation_id !== dialog.generation) {
      stale();
      return;
    }
    if (dialog.kind === 'remove') {
      if (await write(dialog.source, text => removeRule(text, dialog.rule))) {
        toast('positive', t('rule.removed'));
        dismiss();
      }
      return;
    }
    const anchor = form.before === 'end' ? list.find(rule => rule.kind === 'fallback') : list.find(rule => rule.rule_id === form.before);
    const source = sources.find(source => source.id === anchor?.source?.source_id);
    if (!anchor?.source || !source) {
      stale();
      return;
    }
    if (await write(source, text => addRule(text, anchor, condition, form.outbound, form.must))) {
      toast('positive', t('rule.added'));
      dismiss();
    }
  };
  const draft = ruleDraftView(pick.kind, pick.value, pick.on, condition, form.condition, t);
  const dialogView = dialog?.kind === 'remove' ? {kind: 'remove' as const, ...removalView(dialog.rule, sources, t)} : dialog;
  return {
    kind: dictionary ? ('dictionary' as const) : ('distribution' as const),
    table,
    distribution,
    source,
    setSource,
    selected,
    select: (row: string | null) => setPicked({landed, row}),
    canWrite,
    busy: !!editor.busy,
    addDisabled: !table.positions.length || !!editor.busy,
    loading: dictionary ? rules.loading && !rules.data : flows.loading && !flows.data,
    error: dictionary ? (rules.error ?? config.error) : flows.error,
    retry,
    dialog: dialogView,
    dialogTitle: t(dialog?.kind === 'remove' ? 'rule.removeTitle' : 'rule.add'),
    submitLabel: t(dialog?.kind === 'remove' ? 'rule.remove' : 'rule.add'),
    close,
    openAdd: () => {
      if (rules.data) open({kind: 'add', generation: rules.data.generation_id});
    },
    openRemove: (id: string) => {
      const rule = list.find(rule => rule.rule_id === id);
      const source = sources.find(source => source.id === rule?.source?.source_id);
      if (rule && source && rules.data) open({kind: 'remove', rule, source, generation: rules.data.generation_id});
    },
    openSource: (query: string) => go('config', query),
    submit,
    form,
    setForm,
    pick,
    setPick,
    draft,
    submitDisabled: dialog?.kind !== 'remove' && (!draft.valid || !form.outbound),
    changeMode: (mode: string) => {
      if (mode === 'text' && pick.on && pick.value.trim()) setForm({...form, condition});
      setPick({...pick, on: mode === 'pick'});
    }
  };
}
