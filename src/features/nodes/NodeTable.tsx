import {createContext, useContext, useMemo} from 'react';
import {useT} from '../../i18n';
import {Button, ChoiceMenu, DataTable, LabeledSelect, TextField, TextTooltip, type TableColumn} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import {SearchSelect} from '../../ui/SearchSelect';
import SpeedFast from '../../ui/icons/SpeedFast';
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
  const {canManage, writable, sourceBusy, busy, across} = m;
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
            <TextTooltip>{row.name}</TextTooltip>
          </span>
        )
      },
      ...(across
        ? [{id: 'source', label: t('nodes.provider'), minWidth: 140, render: (row: NodeTableView['rows'][number]) => <TextTooltip>{row.source}</TextTooltip>}]
        : []),
      {id: 'protocol', label: t('nodes.protocol'), minWidth: 144, grow: 0, drop: 2, sortable: true, render: row => row.protocol},
      {
        id: 'latency',
        label: t('nodes.latency'),
        minWidth: 96,
        grow: 0,
        align: 'end',
        sortable: true,
        render: row => <span className={row.latencyClass}>{row.latency}</span>
      },
      {id: 'groups', label: t('nodes.groups'), minWidth: 200, drop: 1, render: row => <TextTooltip>{row.groups}</TextTooltip>},
      {
        id: 'actions',
        label: t('ui.actions'),
        minWidth: (canManage ? 108 : 72) + (writable ? 112 : 0),
        grow: 0,
        render: row => (
          <span className="rp-chain">
            {row.canProbe && <ProbeButton row={row} />}
            {writable && (
              <ChoiceMenu quiet label={row.joinLabel} isDisabled={sourceBusy} items={row.menu} onAction={row.join} searchLabel={t('ui.filter')}>
                <AddCircle />
                {t('nodes.addToGroup')}
              </ChoiceMenu>
            )}
            {row.removable && (
              <Button small quiet icon isDisabled={busy} label={row.removeLabel} onPress={row.remove}>
                <Close />
              </Button>
            )}
          </span>
        )
      }
    ],
    [t, across, canManage, writable, sourceBusy, busy]
  );
  return (
    <>
      {m.writable && m.sourceTip && <p className="rp-note">{m.sourceTip}</p>}
      {m.scope && <p className="rp-label">{m.scope}</p>}
      <div className="rp-toolbar">
        <TextField label={t('nodes.search')} search value={m.search} width={240} onChange={m.setSearch} />
        {m.groupSections ? (
          <SearchSelect side label={t('nodes.group')} searchLabel={t('ui.filter')} value={m.group} onChange={m.setGroup} sections={m.groupSections} />
        ) : (
          <LabeledSelect label={t('nodes.group')} side value={m.group} onChange={m.setGroup} items={m.groups} />
        )}
        <LabeledSelect label={t('nodes.protocol')} side value={m.protocol} onChange={m.setProtocol} items={m.protocols} />
        <span className="rp-label">{m.shown}</span>
        <span className="rp-grow" />
        {m.canManage && (
          <Button small onPress={m.onAdd}>
            {t('nodes.addNode')}
          </Button>
        )}
      </div>
      <ProbeBusy.Provider value={m.probeBusy}>
        <DataTable label={m.label} loading={m.loading} rows={m.rows} height={520} empty={m.empty} sort={m.sort} onSort={m.setSort} cols={columns} />
      </ProbeBusy.Provider>
    </>
  );
}
