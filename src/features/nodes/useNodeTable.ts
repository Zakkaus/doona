import {href} from '../../shell/route';
import {useCallback, useMemo, useState} from 'react';
import {isBuiltinOutbound} from '../../dae/vocab';
import {useFilter} from 'react-aria-components';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Node, Provider} from '../../api/model';
import {useNodeProbe} from '../../store';
import type {OutboundNames} from '../../api/selectors';
import {cachedRows, toast, toastFailure, useLinked, type TableSort} from '../../ui/ui';
import {namedIn, readGroupEntries} from '../../dae/groups';
import type {MainSourceEdit} from '../../store/mainSource';
import {nodeRows, nodeRowView} from './view';
import {compareNames} from '../../i18n/format';
import {longList} from '../../ui/longList';
import type {SearchSection} from '../../ui/SearchSelect';
import {probeToast} from '../shared/probe';
import {policyLabel} from '../shared/policyText';
import {errorText} from '../../api/error';

type NodeTableInput = {
  // The selected source's nodes; a search looks through `all` instead when there is more than one source.
  nodes: Node[];
  all: Node[];
  sourceOf: (node: Node) => string;
  providers: Provider[];
  names: OutboundNames;
  loading: boolean;
  label: string;
  // Which source the table shows and how to change it, where there is more than one.
  scope: string | null;
  multiple: boolean;
  query: string | null;
  groupQuery: string | null;
  nodeIds: string[];
  clearNodes: () => void;
  source: MainSourceEdit;
  canManage: boolean;
  busy: boolean;
  reload: () => void;
  joinGroup: (node: Node, group: string) => void;
  onAdd: () => void;
  onNewGroup: (node: Node) => void;
  onRemove: (node: Node) => void;
  edit: (node: Node) => (() => void) | null;
};
export function useNodeTable(input: NodeTableInput) {
  const {names, providers, source, query, reload, joinGroup, onNewGroup, onRemove, canManage, sourceOf, edit} = input;
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const probe = useNodeProbe(reload);
  const [search, setSearch] = useState(query ?? '');
  useLinked(query, value => setSearch(value ?? ''));
  const [group, setGroup] = useState(input.groupQuery ?? '');
  useLinked(input.groupQuery, value => setGroup(value ?? ''));
  const [protocol, setProtocol] = useState('');
  useLinked(JSON.stringify(input.nodeIds), () => {
    setGroup('');
    setProtocol('');
  });
  const [sort, setSort] = useState<TableSort>({column: 'name', direction: 'ascending'});
  const selectedNodes = input.nodeIds.length > 0;
  const across = (!!input.groupQuery || (input.multiple && search.trim() !== '')) && !selectedNodes;
  const nodes = selectedNodes ? input.all.filter(node => input.nodeIds.includes(node.id)) : across ? input.all : input.nodes;
  const groups = useMemo(
    () =>
      [...new Set(nodes.flatMap(node => node.group_ids))]
        .sort((a, b) => compareNames(locale)(names.get(a) ?? a, names.get(b) ?? b))
        .map(id => ({id, label: names.get(id) ?? id})),
    [nodes, names, locale]
  );
  const protocols = useMemo(
    () =>
      [...new Set(nodes.map(node => node.protocol ?? ''))]
        .filter(Boolean)
        .sort(compareNames(locale))
        .map(id => ({id, label: id})),
    [nodes, locale]
  );
  const linkedGroup =
    input.groupQuery && !groups.some(item => item.id === input.groupQuery)
      ? [{id: input.groupQuery, label: names.get(input.groupQuery) ?? input.groupQuery}]
      : [];
  const groupItems = [{id: '', label: t('nodes.anyGroup')}, ...linkedGroup, ...groups];
  // A filter chosen for another source applies only if this source offers that value.
  const activeGroup = group === input.groupQuery || groups.some(item => item.id === group) ? group : '';
  const activeProtocol = protocols.some(item => item.id === protocol) ? protocol : '';
  const {contains} = useFilter({sensitivity: 'base'});
  const members = useMemo(
    () => nodeRows(nodes, search, activeGroup, activeProtocol, sort, contains, locale),
    [nodes, search, activeGroup, activeProtocol, sort, contains, locale]
  );
  const entries = useMemo(
    () => readGroupEntries(source.main?.content ?? '').map(entry => ({...entry, names: new Set(namedIn(entry))})),
    [source.main?.content]
  );
  const membership = useMemo(() => new Map(nodes.map(node => [node.id, new Set(node.group_ids.map(id => names.get(id) ?? id))])), [nodes, names]);
  const inlineProviders = useMemo(() => new Set(providers.filter(provider => provider.kind === 'inline').map(provider => provider.id)), [providers]);
  const {probe: runProbe, canProbe, busy: probeBusy} = probe;
  // A row per node object, rebuilt only when the node or what every row reads changes. The running probe is not part
  // of a row: the table reads it, so a probe starting or ending does not rebuild every row.
  const build = useCallback(
    (node: Node): NodeTableView['rows'][number] => ({
      ...nodeRowView(node, names, lang, t),
      source: sourceOf(node),
      groupLinks: node.group_ids.map(id => ({id, label: names.get(id) ?? id, href: href('policies', {group: id})})),
      canProbe: canProbe && !isBuiltinOutbound(node.protocol),
      probe: () =>
        void runProbe(node.id).then(
          result => {
            if (!result) return;
            const {kind, text} = probeToast(result, node.id, node.name, t);
            toast(kind, text);
          },
          error => toastFailure(error, t, t('nodes.probeError', {name: node.name}))
        ),
      menu: () => [
        ...entries
          .filter(entry => !entry.names.has(node.name) && !membership.get(node.id)?.has(entry.name))
          .map(entry => ({id: entry.name, label: entry.name, desc: policyLabel(entry.policy, t)})),
        {id: '/new', label: t('nodes.newGroup')}
      ],
      join: (key: string) => (key === '/new' ? onNewGroup(node) : joinGroup(node, key)),
      removable: canManage && typeof node.provider_id === 'string' && inlineProviders.has(node.provider_id),
      remove: () => onRemove(node),
      edit: edit(node)
    }),
    [names, lang, sourceOf, canProbe, runProbe, t, entries, membership, onNewGroup, joinGroup, canManage, inlineProviders, onRemove, edit]
  );
  const cache = useMemo(() => ({build, rows: new WeakMap<Node, NodeTableView['rows'][number]>()}), [build]);
  const rows = useMemo(() => cachedRows(cache.rows, members, cache.build), [cache, members]);
  return {
    rows,
    probeBusy,
    search,
    setSearch,
    group: activeGroup,
    setGroup,
    protocol: activeProtocol,
    setProtocol,
    sort,
    setSort,
    groups: groupItems,
    groupSections: longList(groups.length) ? [{id: 'groups', items: groupItems}] : null,
    protocols: [{id: '', label: t('nodes.anyProtocol')}, ...protocols],
    shown: t('ui.fraction', {part: formatNumber(rows.length, locale), whole: formatNumber(nodes.length, locale)}),
    loading: input.loading,
    label: across || selectedNodes ? t('nav.nodes') : input.label,
    scope: selectedNodes ? t('nodes.selectedNodes', {n: input.nodeIds.length}) : across ? t('nodes.searchAll') : input.scope,
    across: across || selectedNodes,
    empty: t(across ? 'nodes.noMatch' : 'nodes.empty'),
    canManage,
    busy: input.busy,
    writable: source.writable,
    sourceBusy: source.busy || !source.main,
    sourceTip: source.error ? errorText(source.error, t) : undefined,
    clearNodes: selectedNodes
      ? () => {
          setSearch('');
          setGroup('');
          setProtocol('');
          input.clearNodes();
        }
      : null,
    onAdd: input.onAdd
  };
}
export type NodeTableView = {
  rows: Array<{
    id: string;
    name: string;
    source: string;
    protocol: string;
    latency: string;
    latencyClass: string;
    groups: string;
    groupLinks: Array<{id: string; label: string; href: string}>;
    probeLabel: string;
    removeLabel: string;
    canProbe: boolean;
    probe: () => void;
    menu: () => Array<{id: string; label: string; desc?: string}>;
    join: (key: string) => void;
    removable: boolean;
    remove: () => void;
    edit: (() => void) | null;
  }>;
  // The node whose probe is running; while one runs, every probe button waits.
  probeBusy: string | null;
  search: string;
  setSearch: (value: string) => void;
  group: string;
  setGroup: (value: string) => void;
  protocol: string;
  setProtocol: (value: string) => void;
  sort: TableSort;
  setSort: (value: TableSort) => void;
  groups: Array<{id: string; label: string}>;
  // The same choices for the searchable picker when there are more groups than a menu shows; null otherwise.
  groupSections: SearchSection[] | null;
  protocols: Array<{id: string; label: string}>;
  shown: string;
  loading: boolean;
  label: string;
  scope: string | null;
  // A search spanning every source, whose rows name their source.
  across: boolean;
  empty: string;
  canManage: boolean;
  busy: boolean;
  writable: boolean;
  sourceBusy: boolean;
  sourceTip?: string;
  onAdd: () => void;
  clearNodes: (() => void) | null;
};
