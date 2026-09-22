import {useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Node, Provider} from '../../api/model';
import {useNodeProbe} from '../../store';
import type {OutboundNames} from '../../api/selectors';
import {millis} from '../../api/u64';
import {errorText, toast, useLinked, type TableSort} from '../../ui/ui';
import {namedIn, readGroupEntries} from '../../dae/groups';
import type {MainSourceEdit} from '../config/mainSource';
import {collator, nodeRows, nodeRowView} from './view';

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
        .sort((a, b) => collator.compare(names.get(a) ?? a, names.get(b) ?? b))
        .map(id => ({id, label: names.get(id) ?? id})),
    [nodes, names]
  );
  const protocols = useMemo(
    () =>
      [...new Set(nodes.map(node => node.protocol ?? ''))]
        .filter(Boolean)
        .sort(collator.compare)
        .map(id => ({id, label: id})),
    [nodes]
  );
  // A filter chosen for another source applies only if this source offers that value.
  const activeGroup = groups.some(item => item.id === group) ? group : '';
  const activeProtocol = protocols.some(item => item.id === protocol) ? protocol : '';
  const members = useMemo(() => nodeRows(nodes, search, activeGroup, activeProtocol, sort), [nodes, search, activeGroup, activeProtocol, sort]);
  const entries = useMemo(
    () => readGroupEntries(source.main?.content ?? '').map(entry => ({...entry, names: new Set(namedIn(entry))})),
    [source.main?.content]
  );
  const membership = useMemo(() => new Map(nodes.map(node => [node.id, new Set(node.group_ids.map(id => names.get(id) ?? id))])), [nodes, names]);
  const inlineProviders = useMemo(() => new Set(providers.filter(provider => provider.kind === 'inline').map(provider => provider.id)), [providers]);
  const display = useMemo(() => new Map(members.map(node => [node.id, nodeRowView(node, names, lang, t)])), [members, names, lang, t]);
  const {probe: runProbe, canProbe, busy: probeBusy} = probe;
  const rows = useMemo(
    () =>
      members.map(node => ({
        ...display.get(node.id)!,
        canProbe: canProbe && node.protocol !== 'direct' && node.protocol !== 'block',
        probing: probeBusy === node.id,
        probeDisabled: !!probeBusy,
        probe: () =>
          void runProbe(node.id).then(
            result => {
              if (!result) return;
              const sample = result.results.find(item => item.member_id === node.id && item.state === 'healthy' && item.latency_ms != null);
              toast(
                sample ? 'positive' : 'negative',
                sample ? t('nodes.probed', {name: node.name, n: millis(sample.latency_ms!)}) : t('nodes.probeFailed', {name: node.name})
              );
            },
            error => toast('negative', errorText(error))
          ),
        menu: () => [
          ...entries
            .filter(entry => !entry.names.has(node.name) && !membership.get(node.id)?.has(entry.name))
            .map(entry => ({id: entry.name, label: entry.name, desc: entry.policy ?? 'selector'})),
          {id: '/new', label: t('nodes.newGroup')}
        ],
        join: (key: string) => (key === '/new' ? onNewGroup(node) : joinGroup(node, key)),
        removable: canManage && typeof node.provider_id === 'string' && inlineProviders.has(node.provider_id),
        remove: () => onRemove(node)
      })),
    [members, display, canProbe, probeBusy, runProbe, t, entries, membership, onNewGroup, joinGroup, canManage, inlineProviders, onRemove]
  );
  return {
    rows,
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
    shown: t('nodes.shown', {n: formatNumber(rows.length, locale), total: formatNumber(nodes.length, locale)}),
    loading: input.loading,
    label: input.label,
    canManage,
    busy: input.busy,
    writable: source.writable,
    sourceBusy: source.busy || !source.main,
    sourceTip: source.error ? errorText(source.error) : undefined,
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
    probing: boolean;
    probeDisabled: boolean;
    probe: () => void;
    menu: () => Array<{id: string; label: string; desc?: string}>;
    join: (key: string) => void;
    removable: boolean;
    remove: () => void;
  }>;
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
