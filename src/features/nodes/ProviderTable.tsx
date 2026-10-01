import {useMemo} from 'react';
import {useT} from '../../i18n';
import {ActionGroup, ActionHelp, Badge, Button, DataTable, Light, Link, MoreMenu, TextTooltip, TimeCell, type TableColumn} from '../../ui/ui';
import {phoneQuery, useMediaQuery} from '../../ui/hooks';
import Refresh from '../../ui/icons/Refresh';
import {primaryFirst} from './tableColumns';
import type {ProviderTableView} from './useProviderTable';

export function ProviderTable({model: m}: {model: ProviderTableView}) {
  const t = useT();
  const phone = useMediaQuery(phoneQuery);
  const {canManage, editing, busy, editBusy} = m;
  const columns = useMemo<TableColumn<ProviderTableView['rows'][number]>[]>(
    () => [
      {
        id: 'name',
        label: t('nodes.provider'),
        minWidth: 140,
        grow: 2,
        isRowHeader: true,
        render: row => (
          <span className="rp-chain">
            <TextTooltip text={row.url}>{row.name}</TextTooltip>
          </span>
        )
      },
      {id: 'kind', label: t('nodes.kindLabel'), minWidth: 150, grow: 0, drop: 5, render: row => <Badge>{row.kind}</Badge>},
      {id: 'count', label: t('nodes.count'), minWidth: 80, grow: 0, align: 'end', drop: 6, render: row => row.count},
      {id: 'usage', label: t('nodes.usage'), minWidth: 200, drop: 2, render: row => row.usage},
      {id: 'updated', label: t('nodes.updated'), minWidth: 140, drop: 3, render: row => <TimeCell at={row.updatedAt} />},
      {
        id: 'interval',
        label: t('nodes.interval'),
        minWidth: 130,
        grow: 0,
        drop: 4,
        render: row =>
          row.intervalHref ? (
            <Link appearance="link" href={row.intervalHref} label={row.intervalLabel}>
              {row.interval}
            </Link>
          ) : (
            row.interval
          )
      },
      {id: 'expires', label: t('nodes.expires'), minWidth: 140, drop: 1, render: row => row.expires},
      {
        id: 'status',
        label: t('ui.state'),
        minWidth: 100,
        grow: 0,
        drop: 7,
        render: row =>
          row.status ? (
            <Light small tone={row.tone}>
              <TextTooltip text={row.error}>{row.status}</TextTooltip>
            </Light>
          ) : (
            '—'
          )
      },
      {
        id: 'actions',
        label: t('ui.actions'),
        hideLabel: phone,
        minWidth: (canManage ? 112 : 88) + (editing ? 40 : 0),
        grow: 0,
        render: row => (
          <span className="rp-chain">
            {row.refreshable && (
              <Button small quiet icon isPending={row.refreshing} isDisabled={row.refreshDisabled} label={row.refreshLabel} onPress={row.refresh}>
                <Refresh className="rp-spin-on-press" />
              </Button>
            )}
            {(row.action || row.removable) && (
              <MoreMenu
                small
                quiet
                label={t('ui.moreActionsFor', {name: row.name})}
                actions={[
                  ...(row.action?.kind === 'edit'
                    ? [{id: 'edit', label: row.editLabel, isDisabled: busy || editBusy, onAction: row.action.run}]
                    : row.action?.kind === 'open'
                      ? [{id: 'open', label: t('rule.openSource'), onAction: row.action.run}]
                      : []),
                  ...(row.removable ? [{id: 'remove', label: row.removeLabel, negative: true, isDisabled: busy, onAction: row.remove}] : [])
                ]}
              />
            )}
          </span>
        )
      }
    ],
    [t, canManage, editing, busy, editBusy, phone]
  );
  const cols = useMemo(() => (phone ? primaryFirst(columns, 'count') : columns), [columns, phone]);
  return (
    <>
      {(m.canManage || m.refreshAll) && (
        <ActionHelp reason={m.refreshAll?.reason}>
          <div className="rp-toolbar">
            <span className="rp-grow" />
            <ActionGroup
              actions={[
                ...(m.refreshAll
                  ? [
                      {
                        id: 'refresh',
                        label: m.refreshAll.label,
                        isPending: m.refreshAll.refreshing,
                        isDisabled: m.refreshAll.disabled,
                        onAction: () => void m.refreshAll!.run()
                      }
                    ]
                  : []),
                ...(m.canManage ? [{id: 'add', label: t('nodes.addProvider'), onAction: m.onAdd}] : [])
              ]}
            />
          </div>
        </ActionHelp>
      )}
      <DataTable
        label={t('nodes.providers')}
        loading={m.loading}
        rows={m.rows}
        height={280}
        fit
        selected={m.selected}
        onSelect={m.onSelect}
        selectOnFocus
        empty={t('nodes.noProviders')}
        cols={cols}
      />
    </>
  );
}
