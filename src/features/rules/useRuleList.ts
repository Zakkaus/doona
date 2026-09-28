import {useMemo, useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useFlows, useGroups, usePendingRules, useRules, useRuntimeSettings} from '../../store';
import {pendingView} from '../shared/pending';
import {useLang, useT} from '../../i18n';
import type {RoutingRule} from '../../api/model';
import {conditionKinds} from '../../dae/groups';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {ruleAnchor} from '../../dae/ruleText';
import {parseRuleSeed} from '../shared/link';
import {dictionaryView, distributionView, type DictionaryView, type DistributionView} from './view';
import {offered} from '../../api/capabilities';
import {useRuleEditor, type RuleEditorModel} from './useRuleEditor';

const noDictionary: DictionaryView = {rows: [], caption: null, positions: [], outbounds: []};
const noDistribution: DistributionView = {
  rows: [],
  choices: [],
  caption: null,
  coverage: null,
  droppedUnknown: false,
  empty: '',
  sourceHelp: {title: '', text: ''}
};
// The words and columns that differ between the routing list and the DNS lists.
export type DictionaryCopy = {
  label: string;
  empty: string;
  target: string;
  placeholder: string;
  addHelp: string;
  // Routing rules can lock their outbound with `(must)` and count their hits in flow records; DNS rules do neither.
  must: boolean;
  hits: boolean;
};
// What the rule dictionary renders: one list with its add and remove dialogs.
export type DictionaryModel = RuleEditorModel & {
  table: DictionaryView;
  copy: DictionaryCopy;
  selected: string | null;
  select: (row: string | null) => void;
  held: ReturnType<typeof pendingView>;
  discard: (id: number) => void;
  // An apply has already taken its copy of the held rules, so a discard now would still be written.
  applying: boolean;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  openSource: (query: string) => void;
};
export type RuleListModel = DictionaryModel & {
  kind: 'dictionary' | 'distribution';
  distribution: DistributionView;
  source: string;
  setSource: (source: string) => void;
};
export function useRuleList({go, query}: PageProps): RuleListModel {
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
  const recorder = useRuntimeSettings(!dictionary && (resources?.runtime_settings.available ?? false)).data?.recording?.flows;
  const distribution = useMemo(
    () => (dictionary ? noDistribution : distributionView(flows.data, source, t, lang, recorder)),
    [dictionary, flows.data, source, t, lang, recorder]
  );
  const seed = params.get('add');
  const editor = useRuleEditor<RoutingRule>({
    canWrite,
    list: rules.data,
    config: config.data,
    retry,
    positions: table.positions,
    target: () => groups.data?.[0]?.name ?? 'direct',
    anchor: ruleAnchor,
    kinds: conditionKinds,
    onClose: () => {
      if (seed) go('rules', within(query, {add: null}));
    }
  });
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
    editor.initialize({kind: 'add'}, parsedSeed);
  }
  const held = usePendingRules();
  return {
    ...editor.model,
    kind: dictionary ? ('dictionary' as const) : ('distribution' as const),
    table,
    copy: {
      label: t('rule.listTitle'),
      empty: t('rule.dictionaryEmpty'),
      target: t('ui.outbound'),
      placeholder: 'domain(geosite:netflix)',
      addHelp: t('rule.addHelp'),
      must: true,
      hits: true
    },
    distribution,
    source,
    setSource,
    selected,
    select: (row: string | null) => setPicked({landed, row}),
    held: pendingView(held.rules, held.failure, t),
    discard: (id: number) => {
      if (!held.applying) pendingRules.remove([id]);
    },
    applying: held.applying,
    loading: dictionary ? rules.loading && !rules.data : flows.loading && !flows.data,
    error: dictionary ? (rules.error ?? config.error) : flows.error,
    retry: dictionary ? retry : flows.refetch,
    openSource: (query: string) => go('config', query)
  };
}
