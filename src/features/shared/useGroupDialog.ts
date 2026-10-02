import {useMemo, useRef, useState} from 'react';
import {useLang, useT} from '../../i18n';
import {offered} from '../../api/capabilities';
import {useCapabilities, useNodes, useProviders} from '../../store';
import {useConfig} from '../../store/config';
import {readSubscriptionEntries} from '../../dae/subscriptions';
import {
  groupFilterDraft,
  groupFilterText,
  groupFilterTexts,
  newGroupCondition,
  newGroupFilter,
  type GroupFilterDraft,
  type GroupConditionRow,
  type GroupConditionKind
} from '../../dae/groupConditions';
import {describeFilters, isWritableName} from '../../dae/groups';
import {
  includeChoices,
  includesEveryNode,
  setEveryNode,
  retainedIncludes,
  advancedFilter,
  editMembership,
  selectedIncludes,
  setIncludes,
  type IncludeKind
} from './groupIncludes';
import {nameText, readGroupEntries, writeGroupEntry, type GroupEntry, type GroupEntryUpdate} from '../../dae/groups';
import {href} from '../../shell/route';
import {unquote} from '../../dae/text';
import {editProblem, type MainSourceEdit} from '../../store/mainSource';
import type {ConfigSource, Group, Node} from '../../api/model';
import {toast, type Problem} from '../../ui/ui';
import {useDialogSession, useDraftGuard} from '../../shell/draft';
import {LocalError, noticeText} from '../../api/error';
import {groupEditSafe, groupNameError, manualPolicy} from './policyText';
import {newGroupPolicies} from '../../dae/vocab';
import type {SearchSection} from '../../ui/SearchSelect';
import type {CheckboxChoice} from '../../ui/CheckboxSet';
import {
  editBlocked,
  finalSections,
  finalExcluded,
  groupConfigLabels,
  memberSections,
  draftMembers,
  routeChoiceId,
  routeChoiceValue,
  routeFields,
  routeValue,
  routeWritable,
  type GroupOwner,
  type OutboundCatalogue,
  type RouteField
} from './groupText';
import {addAlternative, changeTerm, conditionTerms, kindChoices, removeAlternative} from './groupTerms';

const conditionLabels = {
  nameKeyword: 'group.filterKind.nameKeyword',
  nameRegex: 'group.filterKind.nameRegex',
  nameExact: 'group.filterKind.nameExact',
  subtag: 'group.filterKind.subtag',
  subtagKeyword: 'group.filterKind.subtagKeyword',
  subtagRegex: 'group.filterKind.subtagRegex'
} as const;

export type GroupDialogView = {
  title: string;
  name: {value: string; error: string | null; change: (value: string) => void} | null;
  submitLabel: string;
  open: boolean;
  // Open on the file's declaration; false while the dialog only shows the group's configuration.
  editing: boolean;
  // Whether the dialog can open on the declaration; when it cannot, it opens read-only (`view`).
  editable: boolean;
  disabled: boolean;
  // Why the declaration cannot be edited.
  tip?: string;
  busy: boolean;
  // Why the last save did not land; `id` changes with each refusal so the alert takes focus again.
  problem: Problem | null;
  policy: string | null;
  membershipFilters: string[] | null;
  invalid: boolean;
  filters: Array<{
    id: number;
    value: string;
    rows: Array<{
      id: number;
      negate: boolean;
      removable: boolean;
      setNegate: (negate: boolean) => void;
      remove: () => void;
      addAlternative: () => void;
      terms: Array<{
        id: number;
        kind: GroupConditionKind;
        value: string;
        first: boolean;
        kinds: Array<{id: GroupConditionKind; label: string}>;
        setKind: (kind: GroupConditionKind) => void;
        setValue: (value: string) => void;
        remove: (() => void) | null;
      }>;
    }> | null;
    error: boolean;
    label: string;
    removeLabel: string;
    change: (value: string) => void;
    remove: () => void;
    addRow: () => void;
  }>;
  includes: {
    choices: Record<IncludeKind, CheckboxChoice[]>;
    nodeSummary: string;
    groupSummary: string;
    selected: Record<IncludeKind, string[]>;
    change: (kind: IncludeKind, value: string[]) => void;
    count: string;
    names: string[];
    everyNode: boolean;
    changeEveryNode: (value: boolean) => void;
    advanced: boolean;
    tags: Array<{id: string; label: string; nodeName: boolean; removeLabel: string; remove: () => void}>;
    stillIn: string;
  };
  // The default member and final outbound pickers under the filters, each only when the group offers it.
  nodesHref?: string;
  undo: () => void;
  canUndo: boolean;
  routes: Array<{
    id: RouteField;
    label: string;
    description: string;
    searchLabel: string;
    value: string;
    sections: SearchSection[];
    change: (id: string) => void;
  }>;
  show: (filters?: string[]) => void;
  // Opens the dialog read-only, on the group's configuration alone.
  view: () => void;
  close: () => void;
  setPolicy: (value: string) => void;
  add: () => void;
  save: (close: () => void) => void;
  interrupt: boolean | null | undefined;
  setInterrupt: (value: boolean) => void;
};
// Where the group is declared, and whether that source's text is complete and the configuration read.
export type PolicyDeclaration = {owner: GroupOwner | undefined; complete: boolean | undefined; loaded: boolean; error: Error | null};
// What the default member and final outbound pickers offer: the live group, its members as their tiles show them,
// and every outbound a final can name.
export type RouteContext = {g: Group | undefined; members: Parameters<typeof memberSections>[0]; outbounds: OutboundCatalogue};
const noNodes: Node[] = [];
const noFilters: string[] = [];
const routeHelp = {default_member_id: 'policy.defaultMemberHelp', final_outbound: 'policy.finalOutboundHelp'} as const;
// The file's key for each field, as the draft holds it.
const routeKeys = {default_member_id: 'default', final_outbound: 'final'} as const;
// `origin` is the source the dialog opened on, so a change on disk refuses the first save; once refused, a save goes against the source as it is
// declared then, since the sources are read again after a refusal. `opened` is the entry as the dialog opened on it, null when creating.
type Draft = {
  name: string;
  origin: ConfigSource | null;
  opened: GroupEntry | null;
  refused: boolean;
  policy: string | null;
  filters: GroupFilterDraft[];
  default: string | null;
  final: string | null;
  interrupt: string | null;
};
type Input =
  | {mode: 'edit'; name: string; source: MainSourceEdit; declaration: PolicyDeclaration; context: RouteContext}
  | {
      mode: 'create';
      source: Pick<MainSourceEdit, 'main' | 'writable' | 'busy' | 'apply'>;
      taken: ReadonlySet<string>;
      outbounds: OutboundCatalogue;
      nodes: Node[];
      onCreated?: (name: string) => void;
    };
export function useGroupDialog(input: Input): GroupDialogView {
  const t = useT();
  const lang = useLang();
  const {source} = input;
  const creating = input.mode === 'create';
  const name = creating ? '' : input.name;
  const declaration = creating ? null : input.declaration;
  const context = creating ? {g: undefined, members: [], outbounds: input.outbounds} : input.context;
  const owner = declaration?.owner;
  const declared = owner === 'ambiguous' ? undefined : owner;
  const entry = declared?.entry;
  const blocked = declaration ? editBlocked(owner, declaration, t) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Draft[]>([]);
  const [viewing, setViewing] = useState(false);
  const busy = source.busy;
  const resources = useCapabilities().data?.resources;
  const allNodes = useNodes(!!draft && offered(resources, 'nodes', {whileLoading: false}));
  const providers = useProviders(!!draft && offered(resources, 'providers', {whileLoading: false}));
  const config = useConfig(!!draft && offered(resources, 'config', {whileLoading: false}));
  const declaredTags = useMemo(
    () => (config.data?.sources ?? []).flatMap(source => readSubscriptionEntries(source.content).map(entry => entry.tag)),
    [config.data]
  );
  const nodes = draft ? (allNodes.data ?? (creating ? input.nodes : noNodes)) : noNodes;
  const filters = useMemo(() => (draft ? groupFilterTexts(draft.filters) : noFilters), [draft]);
  const invalid = !!draft?.filters.some(filter => groupFilterText(filter) === null);
  const quickFilters = draft ? groupFilterTexts(draft.filters.filter(filter => !advancedFilter(filter))) : noFilters;
  const selected = {
    region: selectedIncludes(quickFilters, 'region'),
    subscription: selectedIncludes(quickFilters, 'subscription'),
    node: selectedIncludes(quickFilters, 'node'),
    group: selectedIncludes(quickFilters, 'group')
  };
  const choices = useMemo(
    () => includeChoices(filters, nodes, providers.data?.providers ?? [], lang, declaredTags),
    [filters, nodes, providers.data, lang, declaredTags]
  );
  const routes: RouteField[] = creating
    ? manualPolicy(draft?.policy ?? null)
      ? ['default_member_id', 'final_outbound']
      : ['final_outbound']
    : routeFields(context.g, draft?.policy ?? null);
  const members = draft && manualPolicy(draft.policy) ? draftMembers(filters, nodes, t) : creating ? [] : context.members;
  const groupName = creating ? (draft?.name.trim() ?? '') : (draft?.name ?? '');
  const excluded = finalExcluded(groupName, context.outbounds.links);
  const [tried, setTried] = useState(false);
  const saving = useRef(false);
  const nameProblem = creating && draft ? groupNameError(draft.name.trim(), input.taken, t) : null;
  const session = useDialogSession();
  const [problem, setProblem] = useState<GroupDialogView['problem']>(null);
  const refuse = (text: string, kind?: Problem['kind']) => setProblem(prev => ({id: (prev?.id ?? 0) + 1, text, kind}));
  const guard = useDraftGuard(
    !!draft &&
      ((creating && !!draft.name) ||
        (!creating && draft.interrupt !== entry?.interrupt) ||
        draft.policy !== (creating ? newGroupPolicies[0].id : entry?.policy) ||
        invalid ||
        JSON.stringify(filters) !== JSON.stringify(creating ? [] : entry?.filters) ||
        routes.some(id => draft[routeKeys[id]] !== routeValue(entry?.[routeKeys[id]] ?? null))),
    () => {
      session.next();
      setDraft(null);
      setProblem(null);
    }
  );
  const save = (close: () => void) => {
    if (!draft || source.busy || saving.current) return;
    setTried(true);
    if (nameProblem || invalid) return;
    // A retry merges into the group as read again; when it is gone or declared twice, there is nothing to merge into.
    if (draft.refused && draft.opened && !entry) {
      refuse(t('policy.editReopen'));
      return;
    }
    const filters = groupFilterTexts(draft.filters).filter(f => f.trim());
    const written = {default: entry?.default ?? null, final: entry?.final ?? null};
    if (
      !groupEditSafe(filters, draft.policy, entry) ||
      !routes.every(id => routeWritable(draft[routeKeys[id]], written[routeKeys[id]])) ||
      (creating && draft.final !== null && excluded.has(draft.final))
    ) {
      refuse(t('policy.editUnsafe'));
      return;
    }
    const group = creating ? draft.name.trim() : draft.name;
    const update: GroupEntryUpdate = {filters, policy: draft.policy, ...(!creating ? {interrupt: draft.interrupt} : {})};
    for (const id of routes) Object.assign(update, {[routeKeys[id]]: nameText(draft[routeKeys[id]], written[routeKeys[id]])});
    if (draft.refused && draft.opened && entry) {
      // A retry writes only the fields changed since the dialog opened and keeps the rest as read again, so another client's edits stay;
      // a field changed both here and on disk, to different values, is not written.
      const {opened} = draft;
      const keys = ['filters', 'policy', 'interrupt', ...routes.map(id => routeKeys[id])] as const;
      type Key = (typeof keys)[number];
      // Interruption compares as a flag, so `'true'` and `true` agree.
      const flag = (value: string | null) => (value === null ? null : unquote(value) === 'true');
      const read = (from: GroupEntry, key: Key) =>
        JSON.stringify(key === 'default' || key === 'final' ? routeValue(from[key]) : key === 'interrupt' ? flag(from[key]) : from[key]);
      const mine = (key: Key) => JSON.stringify(key === 'filters' ? filters : key === 'interrupt' ? flag(draft[key]) : draft[key]);
      // A field already holding the value read again is not written, so it keeps the spelling there.
      const changed = keys.filter(key => mine(key) !== read(opened, key) && mine(key) !== read(entry, key));
      if (changed.some(key => read(entry, key) !== read(opened, key))) {
        refuse(t('policy.editReopen'));
        return;
      }
      for (const key of keys) if (!changed.includes(key)) Object.assign(update, {[key]: key === 'filters' || key === 'policy' ? entry[key] : undefined});
    }
    saving.current = true;
    const current = session.start();
    const origin = draft.refused ? (creating ? source.main : declared?.origin) : draft.origin;
    void source
      .apply(text => {
        if (creating && readGroupEntries(text).some(entry => entry.name === group)) throw new LocalError('group.takenName');
        return writeGroupEntry(text, group, update);
      }, origin ?? undefined)
      .then(result => {
        const open = current();
        if (result.kind === 'ok') {
          if (open) {
            guard.clear();
            close();
          }
          if (creating && input.onCreated) input.onCreated(group);
          toast('positive', t('policy.updated', {name: group}));
        }
        const problem = editProblem(result, t);
        // A refusal after the dialog closed has nowhere inline to go.
        if (problem) {
          if (open) {
            refuse(noticeText(problem, t), problem.kind);
            setDraft(prev => (prev ? {...prev, refused: true} : prev));
          } else toast(problem.kind, problem.text, {detail: problem.detail, requestId: problem.requestId, error: problem.error});
        }
      })
      .finally(() => {
        saving.current = false;
      });
  };
  // Edits wait while a save is in flight; what was submitted is what the outcome describes.
  const edit = (update: (prev: NonNullable<typeof draft>) => NonNullable<typeof draft>) => {
    if (!source.busy && !saving.current && draft) {
      const next = update(draft);
      if (JSON.stringify(next) === JSON.stringify(draft)) return;
      setHistory(previous => [...previous, draft]);
      setDraft(next);
    }
  };
  return {
    title: creating ? t('group.newGroup') : t(draft ? 'policy.editTitle' : 'policy.viewTitle', {name}),
    name:
      creating && draft
        ? {value: draft.name, error: tried || draft.name.trim() ? nameProblem : null, change: value => edit(prev => ({...prev, name: value}))}
        : null,
    submitLabel: t(creating ? 'group.create' : 'policy.save'),
    open: !!draft || viewing,
    editing: !!draft,
    editable: !!draft || (source.writable && blocked === null),
    disabled: busy,
    tip: blocked ?? (source.writable ? undefined : t('group.readOnly')),
    busy,
    problem,
    policy: draft?.policy ?? null,
    membershipFilters: draft ? filters : (entry?.filters ?? null),
    invalid,
    filters: (draft?.filters ?? []).filter(advancedFilter).map((filter, index, fields) => {
      const update = (change: (filter: GroupFilterDraft) => GroupFilterDraft) =>
        edit(prev => ({...prev, filters: prev.filters.map(item => (item.id === filter.id ? change(item) : item))}));
      const changeRow = (row: GroupConditionRow) => update(item => ({...item, rows: item.rows!.map(value => (value.id === row.id ? row : value))}));
      return {
        id: filter.id,
        value: filter.source,
        rows:
          filter.rows?.map(row => ({
            id: row.id,
            negate: row.negate,
            removable: filter.rows!.length !== 1,
            setNegate: (negate: boolean) => changeRow({...row, negate}),
            remove: () => update(item => ({...item, rows: item.rows!.filter(value => value.id !== row.id)})),
            addAlternative: () => changeRow(addAlternative(row)),
            terms: conditionTerms(row).map((term, index) => ({
              ...term,
              first: index === 0,
              kinds: kindChoices(row).map(kind => ({id: kind, label: t(conditionLabels[kind as keyof typeof conditionLabels])})),
              setKind: (kind: GroupConditionKind) => changeRow(changeTerm(row, term.id, {kind})),
              setValue: (value: string) => changeRow(changeTerm(row, term.id, {value})),
              remove: index === 0 ? null : () => changeRow(removeAlternative(row, term.id))
            }))
          })) ?? null,
        error: groupFilterText(filter) === null,
        label: fields.length === 1 ? t('ui.filter') : t('policy.filterN', {n: index + 1}),
        removeLabel: t('policy.removeFilter', {n: index + 1}),
        change: (value: string) => update(item => ({...groupFilterDraft(value, true), id: item.id})),
        remove: () => edit(prev => ({...prev, filters: prev.filters.filter(item => item.id !== filter.id)})),
        addRow: () => update(item => ({...item, rows: [...item.rows!, newGroupCondition()]}))
      };
    }),
    includes: {
      choices: {
        region: choices.region.map(item => ({id: item.id, label: t('group.subscriptionCount', {name: item.label, n: item.count})})),
        subscription: choices.subscription.map(item => ({
          id: item.id,
          label: t('group.subscriptionCount', {name: item.label, n: item.count}),
          isDisabled: item.disabled
        })),
        node: choices.node.map(item => ({id: item.id, label: item.label, nodeName: true, isDisabled: item.disabled})),
        group: [...new Set([...context.outbounds.groups, ...selected.group])].map(name => ({
          id: name,
          label: name,
          isDisabled: excluded.has(name) || !isWritableName(name) || /[|,]/.test(name)
        }))
      },
      groupSummary: selected.group.length ? t('group.selected', {n: selected.group.length}) : t('ui.none'),
      nodeSummary: selected.node.length ? t('group.selected', {n: selected.node.length}) : t('ui.none'),
      selected,
      change: (kind, value) => edit(prev => ({...prev, filters: editMembership(prev.filters, filters => setIncludes(filters, kind, value))})),
      count: t('group.memberCount', {n: choices.matchedNodes.length}),
      names: [...new Set(choices.matchedNodes.map(node => node.name))],
      everyNode:
        includesEveryNode(filters) &&
        !draft?.filters.some(filter => advancedFilter(filter) && describeFilters([groupFilterText(filter) ?? filter.source]).everyNode),
      changeEveryNode: value => edit(prev => ({...prev, filters: editMembership(prev.filters, filters => setEveryNode(filters, value))})),
      advanced: !!draft?.filters.some(advancedFilter),
      tags: (['region', 'subscription', 'node', 'group'] as const).flatMap(kind =>
        selected[kind].map(value => {
          const item = kind === 'group' ? undefined : choices[kind].find(item => item.id === value);
          const label = kind === 'region' && item ? t('group.subscriptionCount', {name: item.label, n: item.count}) : (item?.label ?? value);
          return {
            id: `${kind}:${value}`,
            label,
            nodeName: kind === 'node',
            removeLabel: t('group.removeMember', {name: item?.label ?? value}),
            remove: () =>
              edit(prev => ({
                ...prev,
                filters: editMembership(prev.filters, filters =>
                  setIncludes(
                    filters,
                    kind,
                    selected[kind].filter(id => id !== value)
                  )
                )
              }))
          };
        })
      ),
      stillIn: (() => {
        const prior = history.at(-1)?.filters;
        if (!prior) return '';
        const retained = retainedIncludes(groupFilterTexts(prior), filters, nodes);
        return retained.length ? t('group.stillIn', {n: retained.length}) : '';
      })()
    },
    nodesHref: !creating && context.g ? href('nodes', {group: context.g.id}) : undefined,
    canUndo: history.length > 0,
    undo: () => {
      if (!busy && !saving.current && history.length) {
        setDraft(history.at(-1)!);
        setHistory(history.slice(0, -1));
      }
    },
    routes: draft
      ? routes.map(id => {
          const key = routeKeys[id];
          const held = [routeValue(entry?.[key] ?? null), draft[key]];
          return {
            id,
            label: t(groupConfigLabels[id]),
            description: t(routeHelp[id]),
            searchLabel: t(id === 'default_member_id' ? 'ui.filterMembers' : 'ui.filterOutbounds'),
            value: routeChoiceId(draft[key]),
            sections: id === 'default_member_id' ? memberSections(members, held, t) : finalSections(groupName, context.outbounds, held, t),
            change: (choice: string) => edit(prev => ({...prev, [key]: routeChoiceValue(choice)}))
          };
        })
      : [],
    show: (filters = []) => {
      session.next();
      setHistory([]);
      setProblem(null);
      setTried(false);
      if (creating)
        setDraft({
          name: '',
          origin: source.main,
          opened: null,
          refused: false,
          policy: newGroupPolicies[0].id,
          filters: filters.map(filter => groupFilterDraft(filter)),
          default: null,
          final: null,
          interrupt: null
        });
      else if (declared && !blocked)
        setDraft({
          name: declared.entry.name,
          origin: declared.origin,
          opened: declared.entry,
          refused: false,
          policy: declared.entry.policy,
          filters: (filters.length
            ? [...declared.entry.filters, ...filters.filter(filter => !declared.entry.filters.includes(filter))]
            : declared.entry.filters
          ).map(filter => groupFilterDraft(filter)),
          default: routeValue(declared.entry.default),
          final: routeValue(declared.entry.final),
          interrupt: declared.entry.interrupt
        });
    },
    view: () => {
      session.next();
      setProblem(null);
      setViewing(true);
    },
    close: () => {
      session.next();
      setProblem(null);
      guard.clear();
      setDraft(null);
      setViewing(false);
    },
    setPolicy: policy => edit(prev => ({...prev, policy})),
    add: () => edit(prev => ({...prev, filters: [...prev.filters, newGroupFilter()]})),
    save,
    interrupt: draft ? (draft.interrupt === null ? null : unquote(draft.interrupt) === 'true') : undefined,
    setInterrupt: value => edit(prev => ({...prev, interrupt: value ? 'true' : prev.interrupt === null ? null : 'false'}))
  };
}
