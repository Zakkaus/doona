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
import {probeToast} from '../shared/probe';
import {policyLabel} from '../shared/policyText';
import {errorText} from '../../api/error';

type NodeTableInput = {
  nodes: Node[];
  providers: Provider[];
  names: OutboundNames;
  loading: boolean;
  label: string;
  query: string | null;
  source: MainSourceEdit;
  canManage: boolean;
  busy: boolean;
  reload: () => void;
  joinGroup: (node: Node, group: string) => void;
  onAdd: () => void;
  onNewGroup: (node: Node) => void;
  onRemove: (node: Node) => void;
};
export function useNodeTable(input: NodeTableInput) {
  const {nodes, names, providers, source, query, reload, joinGroup, onNewGroup, onRemove, canManage} = input;
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const probe = useNodeProbe(reload);
  const [search, setSearch] = useState(query ?? '');
  useLinked(query, value => setSearch(value ?? ''));
  const [group, setGroup] = useState('');
  const [protocol, setProtocol] = useState('');
  const [sort, setSort] = useState<TableSort>({column: 'name', direction: 'ascending'});
  const groups = useMemo(
    () =>
      [...new Set(nodes.flatMap(node => node.group_ids))]
        .sort((a, b) => compareNames(names.get(a) ?? a, names.get(b) ?? b))
        .map(id => ({id, label: names.get(id) ?? id})),
    [nodes, names]
  );
  const protocols = useMemo(
    () =>
      [...new Set(nodes.map(node => node.protocol ?? ''))]
        .filter(Boolean)
        .sort(compareNames)
        .map(id => ({id, label: id})),
    [nodes]
  );
  // A filter chosen for another source applies only if this source offers that value.
  const activeGroup = groups.some(item => item.id === group) ? group : '';
  const activeProtocol = protocols.some(item => item.id === protocol) ? protocol : '';
  const {contains} = useFilter({sensitivity: 'base'});
  const members = useMemo(
    () => nodeRows(nodes, search, activeGroup, activeProtocol, sort, contains),
    [nodes, search, activeGroup, activeProtocol, sort, contains]
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
      canProbe: canProbe && !isBuiltinOutbound(node.protocol),
      probe: () =>
        void runProbe(node.id).then(
          result => {
            if (!result) return;
            const {kind, text} = probeToast(result, node.id, node.name, t);
            toast(kind, text);
          },
          error => toastFailure(error, t, error => t('nodes.probeError', {name: node.name, error}))
        ),
      menu: () => [
        ...entries
          .filter(entry => !entry.names.has(node.name) && !membership.get(node.id)?.has(entry.name))
          .map(entry => ({id: entry.name, label: entry.name, desc: policyLabel(entry.policy, t)})),
        {id: '/new', label: t('nodes.newGroup')}
      ],
      join: (key: string) => (key === '/new' ? onNewGroup(node) : joinGroup(node, key)),
      removable: canManage && typeof node.provider_id === 'string' && inlineProviders.has(node.provider_id),
      remove: () => onRemove(node)
    }),
    [names, lang, canProbe, runProbe, t, entries, membership, onNewGroup, joinGroup, canManage, inlineProviders, onRemove]
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
    groups: [{id: '', label: t('nodes.anyGroup')}, ...groups],
    protocols: [{id: '', label: t('nodes.anyProtocol')}, ...protocols],
    shown: t('ui.fraction', {part: formatNumber(rows.length, locale), whole: formatNumber(nodes.length, locale)}),
    loading: input.loading,
    label: input.label,
    canManage,
    busy: input.busy,
    writable: source.writable,
    sourceBusy: source.busy || !source.main,
    sourceTip: source.error ? errorText(source.error, t) : undefined,
    onAdd: input.onAdd
  };
}
export type NodeTableView = {
  rows: Array<{
    id: string;
    name: string;
    protocol: string;
    latency: string;
    latencyClass: string;
    groups: string;
    probeLabel: string;
    joinLabel: string;
    removeLabel: string;
    canProbe: boolean;
    probe: () => void;
    menu: () => Array<{id: string; label: string; desc?: string}>;
    join: (key: string) => void;
    removable: boolean;
    remove: () => void;
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
  protocols: Array<{id: string; label: string}>;
  shown: string;
  loading: boolean;
  label: string;
  canManage: boolean;
  busy: boolean;
  writable: boolean;
  sourceBusy: boolean;
  sourceTip?: string;
  onAdd: () => void;
};
