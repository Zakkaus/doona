import {useCallback, type ReactNode} from 'react';
import {useT} from '../../i18n';
import {ActionGroup, ActionHelp, Badge, Button, CardView, CardViewItem, Kv, Light, MoreMenu, TextTooltip, TimeCell, Toolbar} from '../../ui/ui';
import Refresh from '../../ui/icons/Refresh';
import type {ProviderTableView} from './useProviderTable';

type Row = ProviderTableView['rows'][number];

// The node sources as cards: the selected one chooses the nodes listed below. Every card lists the same facts, so the
// cards of a row line up; usage closes the facts on a row of its own, metered under its value when there is a quota.
// `intro` is the page's lead line, which shares the toolbar row with the actions so the row is not left empty beside them.
export function ProviderCards({model: m, intro}: {model: ProviderTableView; intro: ReactNode}) {
  const t = useT();
  const {busy, editBusy} = m;
  const card = useCallback(
    (row: Row) => (
      <CardViewItem
        id={row.id}
        title={row.name}
        titleFull={row.url}
        meta={
          <>
            <Badge>{row.kind}</Badge>
            {row.status && (
              <Light small tone={row.tone}>
                <TextTooltip text={row.error}>{row.status}</TextTooltip>
              </Light>
            )}
          </>
        }
        actions={
          <>
            {row.refreshable && (
              <Button quiet icon isPending={row.refreshing} isDisabled={row.refreshDisabled} label={row.refreshLabel} onPress={row.refresh}>
                <Refresh className="rp-spin-on-press" />
              </Button>
            )}
            {(row.action || row.removable) && (
              <MoreMenu
                quiet
                label={t('ui.moreActionsFor', {name: row.name})}
                actions={[
                  ...(row.action?.kind === 'edit'
                    ? [{id: 'edit', label: row.editLabel, isDisabled: busy || editBusy, onAction: row.action.run}]
                    : row.action?.kind === 'open'
                      ? [{id: 'open', label: t('rule.openSource'), onAction: row.action.run}]
                      : []),
                  ...(row.removable
                    ? [
                        {
                          id: 'remove',
                          label: row.removeLabel,
                          negative: true,
                          isDisabled: busy || !!row.removeReason,
                          reason: row.removeReason ?? undefined,
                          onAction: row.remove
                        }
                      ]
                    : [])
                ]}
              />
            )}
          </>
        }
      >
        <Kv
          items={[
            [t('nodes.count'), row.count],
            [t('nodes.updated'), <TimeCell key="updated" at={row.updatedAt} />],
            [t('nodes.interval'), row.interval],
            {label: t('nodes.expires'), value: row.expiresShort, fit: true, full: row.expiresShort === '—' ? undefined : row.expires},
            {label: t('nodes.usage'), value: row.usage, wide: true, meter: row.quota ? {value: row.quota.pct, tone: row.quota.tone} : undefined}
          ]}
        />
      </CardViewItem>
    ),
    [t, busy, editBusy]
  );
  return (
    <>
      {m.canManage || m.refreshAll ? (
        <ActionHelp reason={m.refreshAll?.reason}>
          <Toolbar page>
            {intro}
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
          </Toolbar>
        </ActionHelp>
      ) : (
        intro
      )}
      <CardView label={t('nodes.providers')} items={m.rows} selected={m.selected} onSelect={m.onSelect} loading={m.loading} empty={t('nodes.noProviders')}>
        {card}
      </CardView>
    </>
  );
}
