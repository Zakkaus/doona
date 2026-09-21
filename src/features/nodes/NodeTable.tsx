import {useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatList, formatNumber} from '../../i18n';
import type {Node, Provider} from '../../api/model';
import {useNodeProbe} from '../../api/store';
import {preferredHealth, type OutboundNames} from '../../api/selectors';
import {millis} from '../../api/u64';
import {Button, DataTable, LabeledSelect, ChoiceMenu, TextField, TextTooltip, errorText, latencyTone, toast, useLinked, type TableSort} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import SpeedFast from '../../ui/icons/SpeedFast';
import {namedIn, readGroupEntries} from '../config/groups';
import type {MainSourceEdit} from '../config/mainSource';
import {collator, nodeRows} from './view';

// Group names cannot start with a slash.
const NEW_GROUP = '/new';

export function NodeTable({
  nodes,
  providers,
  names,
  loading,
  label,
  query,
  source,
  canManage,
  busy,
  reload,
  joinGroup,
  onAdd,
  onNewGroup,
  onRemove
}: {
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
}) {
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
    () => [...new Set(nodes.flatMap(node => node.group_ids))].sort((a, b) => collator.compare(names.get(a) ?? a, names.get(b) ?? b)),
    [nodes, names]
  );
  const protocols = useMemo(() => [...new Set(nodes.map(node => node.protocol ?? ''))].filter(Boolean).sort(collator.compare), [nodes]);
  const members = useMemo(() => nodeRows(nodes, search, group, protocol, sort), [nodes, search, group, protocol, sort]);
  const groupEntries = useMemo(() => readGroupEntries(source.main?.content ?? ''), [source.main?.content]);
  return (
    <>
      <div className="rp-toolbar">
        <TextField label={t('nodes.search')} search value={search} width={220} onChange={setSearch} />
        <LabeledSelect
          label={t('nodes.group')}
          side
          value={group}
          onChange={setGroup}
          items={[{id: '', label: t('nodes.anyGroup')}, ...groups.map(id => ({id, label: names.get(id) ?? id}))]}
        />
        <LabeledSelect
          label={t('nodes.protocol')}
          side
          value={protocol}
          onChange={setProtocol}
          items={[{id: '', label: t('nodes.anyProtocol')}, ...protocols.map(id => ({id, label: id}))]}
        />
        <span className="rp-label">{t('nodes.shown', {n: formatNumber(members.length, locale), total: formatNumber(nodes.length, locale)})}</span>
        <span className="rp-grow" />
        {canManage && (
          <Button small onPress={onAdd}>
            {t('nodes.addNode')}
          </Button>
        )}
      </div>
      <DataTable
        label={label}
        loading={loading}
        rows={members}
        height={520}
        empty={t('nodes.empty')}
        sort={sort}
        onSort={setSort}
        cols={[
          {
            id: 'name',
            label: t('nodes.node'),
            minWidth: 150,
            grow: 2,
            isRowHeader: true,
            sortable: true,
            render: node => (
              <span className="rp-chain">
                <TextTooltip>{node.name}</TextTooltip>
              </span>
            )
          },
          {id: 'protocol', label: t('nodes.protocol'), minWidth: 120, grow: 0, drop: 2, sortable: true, render: node => node.protocol ?? '—'},
          {
            id: 'latency',
            label: t('nodes.latency'),
            minWidth: 96,
            grow: 0,
            align: 'end',
            sortable: true,
            render: node => {
              const health = preferredHealth(node);
              return health?.state === 'healthy' && health.latency_ms != null ? (
                <span className={'ms ' + latencyTone(health.latency_ms)}>{t('ui.latency', {n: millis(health.latency_ms)})}</span>
              ) : (
                <span className="ms err">{health?.state === 'unavailable' ? t('ui.unavailable') : '—'}</span>
              );
            }
          },
          {
            id: 'groups',
            label: t('nodes.groups'),
            minWidth: 200,
            drop: 1,
            render: node => (
              <TextTooltip>
                {node.group_ids.length
                  ? formatList(
                      lang,
                      node.group_ids.map(id => names.get(id) ?? id)
                    )
                  : '—'}
              </TextTooltip>
            )
          },
          {
            id: 'actions',
            label: t('ui.actions'),
            minWidth: canManage ? 108 : 72,
            grow: 0,
            render: node => (
              <span className="rp-chain">
                {probe.canProbe && node.protocol !== 'direct' && node.protocol !== 'block' && (
                  <Button
                    small
                    quiet
                    icon
                    isPending={probe.busy === node.id}
                    isDisabled={!!probe.busy}
                    label={t('nodes.probe', {name: node.name})}
                    onPress={() => {
                      void probe.probe(node.id).then(
                        result => {
                          if (!result) return;
                          const sample = result.results.find(item => item.member_id === node.id && item.state === 'healthy' && item.latency_ms != null);
                          toast(
                            sample ? 'positive' : 'negative',
                            sample ? t('nodes.probed', {name: node.name, n: millis(sample.latency_ms!)}) : t('nodes.probeFailed', {name: node.name})
                          );
                        },
                        error => toast('negative', errorText(error))
                      );
                    }}
                  >
                    <SpeedFast />
                  </Button>
                )}
                {source.writable && (
                  <ChoiceMenu
                    quiet
                    chevron={false}
                    label={t('nodes.joinGroup', {name: node.name})}
                    value=""
                    isDisabled={source.busy}
                    onChange={key => (key === NEW_GROUP ? onNewGroup(node) : joinGroup(node, key))}
                    items={[
                      ...groupEntries
                        .filter(entry => !namedIn(entry).includes(node.name) && !node.group_ids.some(id => (names.get(id) ?? id) === entry.name))
                        .map(entry => ({id: entry.name, label: entry.name, desc: entry.policy ?? 'selector'})),
                      {id: NEW_GROUP, label: t('nodes.newGroup')}
                    ]}
                  >
                    <AddCircle />
                  </ChoiceMenu>
                )}
                {canManage && providers.some(provider => provider.id === node.provider_id && provider.kind === 'inline') && (
                  <Button small quiet isDisabled={busy} label={t('nodes.remove', {name: node.name})} onPress={() => onRemove(node)}>
                    <Close />
                  </Button>
                )}
              </span>
            )
          }
        ]}
      />
    </>
  );
}
