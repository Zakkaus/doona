import {Menu} from 'react-aria-components';
import {useT} from '../../i18n';
import {Button, DataTable, LabeledSelect, MenuButton, MenuChoice, TextField, TextTooltip, pickMenuKey} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import SpeedFast from '../../ui/icons/SpeedFast';
import type {NodeTableView} from './useNodeTable';

function JoinOptions({row}: {row: NodeTableView['rows'][number]}) {
  return (
    <Menu aria-label={row.joinLabel} selectionMode="single" selectedKeys={[]} onSelectionChange={pickMenuKey(row.join)}>
      {row.menu().map(item => (
        <MenuChoice key={item.id} item={item} />
      ))}
    </Menu>
  );
}
export function NodeTable({model: m}: {model: NodeTableView}) {
  const t = useT();
  return (
    <>
      <div className="rp-toolbar">
        <TextField label={t('nodes.search')} search value={m.search} width={220} onChange={m.setSearch} />
        <LabeledSelect label={t('nodes.group')} side value={m.group} onChange={m.setGroup} items={m.groups} />
        <LabeledSelect label={t('nodes.protocol')} side value={m.protocol} onChange={m.setProtocol} items={m.protocols} />
        <span className="rp-label">{m.shown}</span>
        <span className="rp-grow" />
        {m.canManage && (
          <Button small onPress={m.onAdd}>
            {t('nodes.addNode')}
          </Button>
        )}
      </div>
      <DataTable
        label={m.label}
        loading={m.loading}
        rows={m.rows}
        height={520}
        empty={t('nodes.empty')}
        sort={m.sort}
        onSort={m.setSort}
        cols={[
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
          {id: 'protocol', label: t('nodes.protocol'), minWidth: 120, grow: 0, drop: 2, sortable: true, render: row => row.protocol},
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
            minWidth: m.canManage ? 108 : 72,
            grow: 0,
            render: row => (
              <span className="rp-chain">
                {row.canProbe && (
                  <Button small quiet icon isPending={row.probing} isDisabled={row.probeDisabled} label={row.probeLabel} onPress={row.probe}>
                    <SpeedFast />
                  </Button>
                )}
                {m.writable && (
                  <MenuButton quiet chevron={false} label={row.joinLabel} isDisabled={m.sourceBusy} content={<JoinOptions row={row} />}>
                    <AddCircle />
                  </MenuButton>
                )}
                {row.removable && (
                  <Button small quiet isDisabled={m.busy} label={row.removeLabel} onPress={row.remove}>
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
