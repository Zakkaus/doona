import {useT} from '../../i18n';
import {Badge, Button, DataTable, Light, ChoiceMenu, TextTooltip} from '../../ui/ui';
import Refresh from '../../ui/icons/Refresh';
import Close from '../../ui/icons/Close';
import type {ProviderTableView} from './useProviderTable';

export function ProviderTable({model: m}: {model: ProviderTableView}) {
  const t = useT();
  return (
    <>
      {m.canManage && (
        <div className="rp-toolbar">
          <span className="rp-grow" />
          <Button small onPress={m.onAdd}>
            {t('nodes.addProvider')}
          </Button>
        </div>
      )}
      <DataTable
        label={t('nodes.providers')}
        loading={m.loading}
        rows={m.rows}
        height={280}
        selected={m.selected}
        onSelect={m.onSelect}
        selectOnFocus
        empty={t('nodes.noProviders')}
        cols={[
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
          {id: 'kind', label: t('nodes.kindLabel'), minWidth: 110, grow: 0, drop: 5, render: row => <Badge>{row.kind}</Badge>},
          {id: 'count', label: t('nodes.count'), minWidth: 80, grow: 0, align: 'end', drop: 6, render: row => row.count},
          {id: 'usage', label: t('nodes.usage'), minWidth: 200, drop: 2, render: row => row.usage},
          {id: 'updated', label: t('nodes.updated'), minWidth: 140, drop: 3, render: row => <TextTooltip text={row.updatedTitle}>{row.updated}</TextTooltip>},
          {
            id: 'interval',
            label: t('nodes.interval'),
            minWidth: 130,
            grow: 0,
            drop: 4,
            render: row =>
              row.hasInterval && m.writable ? (
                <TextTooltip text={m.sourceTip}>
                  <ChoiceMenu
                    quiet
                    label={row.intervalLabel}
                    value={row.intervalValue}
                    isDisabled={m.sourceBusy}
                    onChange={row.setInterval}
                    items={row.intervals}
                  >
                    {row.interval}
                  </ChoiceMenu>
                </TextTooltip>
              ) : (
                row.interval
              )
          },
          {id: 'expires', label: t('nodes.expires'), minWidth: 140, drop: 1, render: row => row.expires},
          {
            id: 'status',
            label: t('ui.state'),
            minWidth: 96,
            grow: 0,
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
            minWidth: m.canManage ? 112 : 88,
            grow: 0,
            render: row => (
              <span className="rp-chain">
                {row.refreshable && (
                  <Button small quiet icon isPending={row.refreshing} isDisabled={row.refreshDisabled} label={row.refreshLabel} onPress={row.refresh}>
                    <Refresh className="rp-spin-on-press" />
                  </Button>
                )}
                {row.removable && (
                  <Button small quiet icon isDisabled={m.busy} label={row.removeLabel} onPress={row.remove}>
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
