import {createContext, useContext, useMemo} from 'react';
import {useT} from '../../i18n';
import {Button, ChoiceMenu, DataTable, FitTags, LabeledSelect, LinkTag, Tags, TextField, TextTooltip, Kv, Card, type TableColumn} from '../../ui/ui';
import {NodeName, FlagEditingContext} from '../../ui/NodeName';
import {flagKey} from '../../dae/flags';
import {SettingsContext} from '../../shell/preferences';
import {flagForName} from '../shared/countryFlags';
import {FlagField} from '../../ui/FlagPicker';
import {phoneQuery, useMediaQuery} from '../../ui/hooks';
import Close from '../../ui/icons/Close';
import MoreHorizontal from '../../ui/icons/MoreHorizontal';
import {SearchSelect} from '../../ui/SearchSelect';
import SpeedFast from '../../ui/icons/SpeedFast';
import {primaryFirst} from './tableColumns';
import type {NodeTableView} from './useNodeTable';

// The node whose probe is running, read by the probe buttons alone, so a probe starting or ending re-renders the
// buttons on screen rather than the rows or columns.
const ProbeBusy = createContext<string | null>(null);
function ProbeButton({row}: {row: NodeTableView['rows'][number]}) {
  const busy = useContext(ProbeBusy);
  return (
    <Button small quiet icon isPending={busy === row.id} isDisabled={!!busy} label={row.probeLabel} onPress={row.probe}>
      <SpeedFast />
    </Button>
  );
}
export function NodeTable({model: m}: {model: NodeTableView}) {
  const t = useT();
  const phone = useMediaQuery(phoneQuery);
  const settings = useContext(SettingsContext);
  const editFlag = useContext(FlagEditingContext);
  const {canManage, canJoin, canCreate, busy, across} = m;
  const columns = useMemo<TableColumn<NodeTableView['rows'][number]>[]>(
    () => [
      {
        id: 'name',
        label: t('nodes.node'),
        minWidth: 150,
        grow: 2,
        isRowHeader: true,
        sortable: true,
        render: row => (
          <span className="rp-chain">
            <NodeName name={row.name} />
          </span>
        )
      },
      ...(across
        ? [
            {
              id: 'source',
              label: t('nodes.provider'),
              minWidth: 140,
              drop: 3,
              render: (row: NodeTableView['rows'][number]) => <TextTooltip>{row.source}</TextTooltip>
            }
          ]
        : []),
      {id: 'protocol', label: t('nodes.protocol'), minWidth: 144, grow: 0, drop: 2, sortable: true, render: row => row.protocol},
      {
        id: 'latency',
        label: t('nodes.latency'),
        // Fits the longest value, English "Unavailable" after its dot, with the cell's padding.
        minWidth: 128,
        grow: 0,
        sortable: true,
        render: row => <span className={row.latencyClass}>{row.latency}</span>
      },
      {
        id: 'groups',
        drop: 1,
        label: t('nodes.groups'),
        minWidth: 200,
        render: row =>
          row.groupLinks.length ? <FitTags label={t('nodes.groups')} items={row.groupLinks} more={n => t('nodes.moreGroups', {n})} /> : row.groups
      },
      {
        id: 'actions',
        actions: true,
        label: t('ui.actions'),
        hideLabel: phone,
        minWidth: canManage ? 148 : 104,
        grow: 0,
        render: row => (
          <span className="rp-chain">
            {row.canProbe && <ProbeButton row={row} />}
            {(canJoin || editFlag || row.edit) && (
              <ChoiceMenu
                quiet
                small
                chevron={false}
                label={t('nodes.actions')}
                submenus={() => [
                  ...(row.edit ? [{label: t('nodes.editAction'), onAction: row.edit}] : []),
                  ...(canJoin
                    ? [
                        {
                          label: t('nodes.addToGroup'),
                          sections: [{title: t('nodes.addToGroup'), selectionMode: 'none' as const, value: '', items: row.menu()}],
                          onAction: row.join,
                          actions: canCreate ? [{label: t('nodes.newGroup'), onAction: () => row.join('/new')}] : [],
                          searchLabel: t('ui.filterGroups')
                        }
                      ]
                    : []),
                  ...(editFlag ? [{label: t('flags.edit'), onAction: () => editFlag(row.name)}] : [])
                ]}
              >
                <MoreHorizontal />
              </ChoiceMenu>
            )}
            {row.removable && (
              <Button small quiet icon isDisabled={busy || !!row.removeReason} tip={row.removeReason ?? undefined} label={row.removeLabel} onPress={row.remove}>
                <Close />
              </Button>
            )}
          </span>
        )
      }
    ],
    [t, editFlag, across, canManage, canJoin, canCreate, busy, phone]
  );
  const cols = useMemo(() => (phone ? primaryFirst(columns, 'latency') : columns), [columns, phone]);
  return (
    <>
      {m.writable && m.sourceTip && <p className="rp-note">{m.sourceTip}</p>}
      {m.scope && <p className="rp-label">{m.scope}</p>}
      <div className="rp-toolbar">
        <TextField label={t('nodes.search')} search value={m.search} width={240} onChange={m.setSearch} />
        {m.groupSections ? (
          <SearchSelect side label={t('nodes.group')} searchLabel={t('ui.filterGroups')} value={m.group} onChange={m.setGroup} sections={m.groupSections} />
        ) : (
          <LabeledSelect label={t('nodes.group')} side value={m.group} onChange={m.setGroup} items={m.groups} />
        )}
        <LabeledSelect label={t('nodes.protocol')} side value={m.protocol} onChange={m.setProtocol} items={m.protocols} />
        <span className="rp-label">{m.shown}</span>
        {m.clearNodes && <Button onPress={m.clearNodes}>{t('ui.clearFilters')}</Button>}
        <span className="rp-grow" />
        {m.canManage && <Button onPress={m.onAdd}>{t('nodes.addNode')}</Button>}
      </div>
      <ProbeBusy.Provider value={m.probeBusy}>
        <DataTable
          label={m.label}
          loading={m.loading}
          rows={m.rows}
          height={520}
          empty={m.empty}
          sort={m.sort}
          onSort={m.setSort}
          cols={cols}
          detail={
            settings
              ? row => (
                  <Card title={t('nodes.details')}>
                    <div className="rp-list">
                      <NodeName name={row.name} />
                      <Kv
                        items={[
                          [t('nodes.provider'), row.source],
                          [t('nodes.protocol'), row.protocol],
                          [t('nodes.latency'), row.latency],
                          [
                            t('nodes.groups'),
                            row.groupLinks.length ? (
                              <Tags label={t('nodes.groups')}>
                                {row.groupLinks.map(group => (
                                  <LinkTag key={group.id} href={group.href}>
                                    {group.label}
                                  </LinkTag>
                                ))}
                              </Tags>
                            ) : (
                              row.groups
                            )
                          ]
                        ]}
                      />
                      {row.showProbeKinds && (
                        <div className="rp-list">
                          <span className="rp-label">{t('nodes.probeKinds')}</span>
                          <Kv items={row.probeKinds.map(line => [line.label, <span className={line.tone}>{line.value}</span>])} />
                        </div>
                      )}
                      <FlagField
                        name={row.name}
                        value={settings.ap.flagOverrides[flagKey(row.name)] ?? 'automatic'}
                        automaticFlag={flagForName(row.name)}
                        onChange={value => settings.ap.pickFlag(row.name, value)}
                      />
                    </div>
                  </Card>
                )
              : undefined
          }
        />
      </ProbeBusy.Provider>
    </>
  );
}
