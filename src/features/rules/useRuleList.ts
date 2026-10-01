import {useMemo, useState} from 'react';
import {useCapabilities, useConfig, useFlows, useGroups, useRules, useRuntimeSettings} from '../../store';
import {useLang, useT} from '../../i18n';
import type {RoutingRule} from '../../api/model';
import {conditionKinds} from '../../dae/groups';
import type {PageProps} from '../../shell/routes';
import {within} from '../../shell/route';
import {ruleAnchor} from '../../dae/ruleText';
import {parseRuleSeed, ruleSeedParams} from '../shared/link';
import {dictionaryView, distributionView, type DictionaryView, type DistributionView} from './view';
import {offered} from '../../api/capabilities';
import {useRuleEditor, type RuleEditorModel} from './useRuleEditor';

const noDictionary: DictionaryView = {rows: [], caption: null, positions: [], positionSections: [], outbounds: [], outboundSections: null};
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
  // Routing rules can lock their outbound with `(must)` and count their hits in flow records; DNS rules do neither.
  must: boolean;
  hits: boolean;
};
// What the rule dictionary renders: one list with its add and remove dialogs.
export type DictionaryModel = RuleEditorModel & {
  table: DictionaryView;
  alternate?: {label: string; open: () => void};
  copy: DictionaryCopy;
  // Only the routing list selects a row; a list without `select` has no selection.
  selected?: string | null;
  select?: (row: string | null) => void;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  openSource: (query: string) => void;
  // Each list edits a rule from its row.
  openEdit?: (id: string) => void;
};
export type RuleListModel = DictionaryModel & {
  kind: 'dictionary' | 'distribution';
  distribution: DistributionView;
  sourceFocus: string[];
  clearSources: () => void;
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
  // The sources are read wherever the configuration is, for the links to each rule's line; only writing needs `writable`.
  const readable = dictionary && offered(resources, 'config', {whileLoading: false});
  const canWrite = readable && resources?.config.writable === true;
  const config = useConfig(readable);
  const retry = () => {
    config.refetch();
    rules.refetch();
    groups.refetch();
  };
  const params = new URLSearchParams(query);
  let sourceIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(params.get('sources') ?? '[]');
    if (Array.isArray(parsed)) sourceIds = parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    /* Invalid filters leave the list unfiltered. */
  }
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
  // `add` prefills a new rule's condition; `edit`, which Connections links to, opens an existing rule.
  const seed = params.get('add');
  const edit = params.get('edit');
  const edited = edit ? rules.data?.rules.find(rule => rule.rule_id === edit) : undefined;
  const parsedSeed = parseRuleSeed(seed);
  const editor = useRuleEditor<RoutingRule>({
    canWrite,
    listId: 'routing',
    list: rules.data,
    config: config.data,
    retry,
    positions: table.positions,
    target: groups.data?.[0]?.name ?? 'direct',
    anchor: ruleAnchor,
    kinds: conditionKinds,
    onClose: () => {
      if (seed || edit) go('rules', within(query, ruleSeedParams));
    },
    link: edit
      ? {key: `edit:${edit}`, open: edited ? {kind: 'edit', rule: edited, outbound: edited.outbound ?? '', must: edited.must} : null}
      : {
          key: seed,
          open:
            parsedSeed && (!offered(resources, 'groups', {whileLoading: false}) || !!groups.data)
              ? {
                  kind: 'add',
                  preset: parsedSeed,
                  outbound: params.has('target') ? (table.outbounds.some(item => item.id === params.get('target')) ? params.get('target')! : '') : undefined,
                  before: params.get('before') ?? undefined
                }
              : null
        }
  });
  return {
    ...editor.model,
    kind: dictionary ? ('dictionary' as const) : ('distribution' as const),
    table: sourceIds.length
      ? {...table, rows: table.rows.filter(row => sourceIds.includes(rules.data?.rules.find(rule => rule.rule_id === row.id)?.source?.source_id ?? ''))}
      : table,
    sourceFocus: sourceIds.map(id => config.data?.sources.find(source => source.id === id)?.path ?? id),
    clearSources: () => go('rules', within(query, {sources: null})),
    copy: {
      label: t('rule.listTitle'),
      empty: t('rule.dictionaryEmpty'),
      target: t('ui.outbound'),
      placeholder: 'domain(geosite:netflix)',
      must: true,
      hits: true
    },
    distribution,
    source,
    setSource,
    selected,
    select: (row: string | null) => setPicked({landed, row}),
    loading: dictionary ? rules.loading && !rules.data : flows.loading && !flows.data,
    error: dictionary ? (rules.error ?? config.error ?? groups.error) : flows.error,
    retry: dictionary ? retry : flows.refetch,
    openSource: (query: string) => go('config', query),
    openEdit: (id: string) => {
      const rule = rules.data?.rules.find(rule => rule.rule_id === id);
      if (rule) editor.open({kind: 'edit', rule, outbound: rule.outbound ?? '', must: rule.must});
    }
  };
}
