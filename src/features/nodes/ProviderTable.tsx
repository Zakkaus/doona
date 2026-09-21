import {useLang, useT, LOCALE, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {Provider} from '../../api/model';
import {useProviderRefresh} from '../../api/store';
import {addU64, formatBytes} from '../../api/u64';
import {formatDuration, localTime, relativeStart} from '../../api/selectors';
import {Badge, Button, DataTable, Light, ChoiceMenu, TextTooltip, errorText, toast} from '../../ui/ui';
import Refresh from '../../ui/icons/Refresh';
import Close from '../../ui/icons/Close';
import type {MainSourceEdit} from '../config/mainSource';
import {writeInterval, type SubscriptionEntry} from './subscriptions';
import type {ProviderRow} from './view';

const INTERVALS = [3600, 21600, 43200, 86400];
const kinds: Record<ProviderRow['kind'], Key> = {
  subscription: 'nodes.kind.subscription',
  file: 'nodes.kind.file',
  inline: 'nodes.kind.inline',
  unknown: 'ui.unknown'
};
const tones = {ok: 'ok', stale: 'warn', error: 'err'} as const;
const statuses: Record<Provider['status'], Key> = {ok: 'nodes.status.ok', stale: 'nodes.status.stale', error: 'nodes.status.error'};

export function ProviderTable({
  rows,
  loading,
  selected,
  onSelect,
  canManage,
  canRefresh,
  busy,
  source,
  entries,
  reload,
  onAdd,
  onRemove
}: {
  rows: ProviderRow[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  canManage: boolean;
  canRefresh: boolean;
  busy: boolean;
  source: MainSourceEdit;
  entries: SubscriptionEntry[];
  reload: () => void;
  onAdd: () => void;
  onRemove: (item: Provider) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const n = (value: number) => formatNumber(value, locale);
  const refresh = useProviderRefresh(reload);
  const intervals = new Map(entries.map(entry => [entry.tag, entry.interval]));
  const intervalLabel = (seconds: number) =>
    seconds === 0
      ? t('nodes.manualOnly')
      : INTERVALS.includes(seconds)
        ? t('nodes.everyHours', {n: n(seconds / 3600)})
        : formatDuration(String(seconds), locale);
  const fail = (error: unknown) => toast('negative', errorText(error));
  return (
    <>
      {canManage && (
        <div className="rp-toolbar">
          <span className="rp-grow" />
          <Button small onPress={onAdd}>
            {t('nodes.addProvider')}
          </Button>
        </div>
      )}
      <DataTable
        label={t('nodes.providers')}
        loading={loading}
        rows={rows}
        height={280}
        selected={selected}
        onSelect={onSelect}
        selectOnFocus
        empty={t('nodes.noProviders')}
        cols={[
          {
            id: 'name',
            label: t('nodes.provider'),
            minWidth: 140,
            grow: 2,
            isRowHeader: true,
            render: item => (
              <span className="rp-chain">
                <TextTooltip text={item.url_redacted ?? undefined}>{item.name}</TextTooltip>
              </span>
            )
          },
          {id: 'kind', label: t('nodes.kindLabel'), minWidth: 110, grow: 0, drop: 5, render: item => <Badge>{t(kinds[item.kind])}</Badge>},
          {id: 'count', label: t('nodes.count'), minWidth: 80, grow: 0, align: 'end', drop: 6, render: item => n(item.node_count)},
          {
            id: 'usage',
            label: t('nodes.usage'),
            minWidth: 200,
            drop: 2,
            render: item => {
              const used = item.traffic ? {used: addU64(item.traffic.upload_bytes, item.traffic.download_bytes), total: item.traffic.total_bytes} : null;
              return used ? (used.total ? t('nodes.used', {used: formatBytes(used.used), total: formatBytes(used.total)}) : formatBytes(used.used)) : '—';
            }
          },
          {
            id: 'updated',
            label: t('nodes.updated'),
            minWidth: 140,
            drop: 3,
            render: item => (
              <TextTooltip text={item.updated_at ? localTime(item.updated_at, locale) : undefined}>{relativeStart(item.updated_at, locale)}</TextTooltip>
            )
          },
          {
            id: 'interval',
            label: t('nodes.interval'),
            minWidth: 130,
            grow: 0,
            drop: 4,
            render: item => {
              const interval = item.kind === 'subscription' ? intervals.get(item.name) : undefined;
              return interval === undefined ? (
                '—'
              ) : source.writable ? (
                <ChoiceMenu
                  quiet
                  label={t('nodes.intervalOf', {name: item.name})}
                  value={String(interval)}
                  isDisabled={source.busy}
                  onChange={key => {
                    const seconds = Number(key);
                    void source
                      .apply(
                        text => writeInterval(text, item.name, seconds),
                        errors => toast('negative', t('nodes.writeInvalid', {n: n(errors)}))
                      )
                      .then(written => {
                        if (written) toast('positive', t('nodes.intervalSet', {name: item.name, interval: intervalLabel(seconds)}));
                      }, fail);
                  }}
                  items={[0, ...INTERVALS, ...(INTERVALS.includes(interval) || interval === 0 ? [] : [interval])].map(seconds => ({
                    id: String(seconds),
                    label: intervalLabel(seconds)
                  }))}
                >
                  {intervalLabel(interval)}
                </ChoiceMenu>
              ) : (
                intervalLabel(interval)
              );
            }
          },
          {id: 'expires', label: t('nodes.expires'), minWidth: 140, drop: 1, render: item => (item.expires_at ? localTime(item.expires_at, locale) : '—')},
          {
            id: 'status',
            label: t('ui.state'),
            minWidth: 96,
            grow: 0,
            render: item =>
              item.kind === 'unknown' ? (
                '—'
              ) : (
                <Light small tone={tones[item.status]}>
                  <TextTooltip text={item.last_error?.message}>{t(statuses[item.status])}</TextTooltip>
                </Light>
              )
          },
          {
            id: 'actions',
            label: t('ui.actions'),
            minWidth: canManage ? 112 : 88,
            grow: 0,
            render: item => (
              <span className="rp-chain">
                {item.kind === 'subscription' && canRefresh && (
                  <Button
                    small
                    quiet
                    icon
                    isPending={refresh.busy === item.id}
                    isDisabled={!!refresh.busy}
                    label={t('nodes.refresh', {name: item.name})}
                    onPress={() => {
                      void refresh.refresh(item.id).then(result => {
                        if (result) toast('positive', t('nodes.refreshed', {name: item.name, n: n(result.node_count)}));
                      }, fail);
                    }}
                  >
                    <Refresh />
                  </Button>
                )}
                {canManage && item.kind !== 'inline' && item.kind !== 'unknown' && (
                  <Button small quiet isDisabled={busy} label={t('nodes.remove', {name: item.name})} onPress={() => onRemove(item)}>
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
