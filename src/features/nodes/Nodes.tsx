import {useEffect, useMemo} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useNodes, useProviderRefresh, useProviders} from '../../api/store';
import type {Node, Provider} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {localTime, preferredHealth, relativeStart} from '../../api/selectors';
import {Badge, Button, DataTable, ErrorMessage, Light, TextTooltip, errorText, latencyTone, toast} from '../../ui/ui';
import Refresh from '../../ui/icons/Refresh';
import {Flag} from '../policies/Flag';
import type {PageProps} from '../types';

const kinds: Record<Provider['kind'], Key> = {subscription: 'nodes.kind.subscription', file: 'nodes.kind.file', inline: 'nodes.kind.inline'};
const tones = {ok: 'ok', stale: 'warn', error: 'err'} as const;
const statuses: Record<Provider['status'], Key> = {ok: 'nodes.status.ok', stale: 'nodes.status.stale', error: 'nodes.status.error'};

// Where nodes come from and what they are: providers (subscriptions, files, the nodes written in the config)
// with their usage and expiry, refreshable when the backend allows; the nodes of the picked provider below.
export function Nodes({go, query}: PageProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const n = (value: number) => formatNumber(value, locale);
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(resources?.providers.available !== false);
  const nodes = useNodes();
  const refresh = useProviderRefresh(() => {
    providers.refetch();
    nodes.refetch();
  });
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const list = providers.data?.providers ?? [];
  const selectedId = params.get('provider') ?? list[0]?.id ?? null;
  const provider = list.find(item => item.id === selectedId) ?? null;
  const select = (id: string | null) => {
    const next = new URLSearchParams(query);
    if (id) next.set('provider', id);
    else next.delete('provider');
    go('nodes', next.toString());
  };
  const members = useMemo(() => (nodes.data ?? []).filter(node => (provider ? node.provider_id === provider.id : true)), [nodes.data, provider]);
  useEffect(() => {
    if (nodes.error) toast('negative', errorText(nodes.error));
  }, [nodes.error]);
  const usage = (item: Provider) => {
    if (!item.traffic) return null;
    const used = (BigInt(item.traffic.upload_bytes ?? '0') + BigInt(item.traffic.download_bytes ?? '0')).toString();
    return {used, total: item.traffic.total_bytes};
  };
  return (
    <div className="rp-page">
      <p className="rp-note">{t('nodes.note')}</p>
      <ErrorMessage error={providers.error} />
      <DataTable
        label={t('nodes.providers')}
        loading={providers.loading && !providers.data}
        rows={list}
        height={280}
        selected={selectedId}
        onSelect={id => id && select(id)}
        selectOnFocus
        empty={t('nodes.noProviders')}
        cols={[
          {id: 'name', label: t('nodes.provider'), minWidth: 200, grow: 2, isRowHeader: true},
          {id: 'kind', label: t('nodes.kindLabel'), minWidth: 110, grow: 0},
          {id: 'count', label: t('nodes.count'), minWidth: 80, grow: 0, align: 'end'},
          {id: 'usage', label: t('nodes.usage'), minWidth: 200, drop: 2},
          {id: 'updated', label: t('nodes.updated'), minWidth: 140, drop: 3},
          {id: 'expires', label: t('nodes.expires'), minWidth: 140, drop: 1},
          {id: 'status', label: t('ui.state'), minWidth: 110, grow: 0},
          {id: 'actions', label: '', minWidth: 96, grow: 0}
        ]}
        render={item => {
          const used = usage(item);
          return [
            <span className="rp-chain">
              <TextTooltip text={item.url_redacted ?? undefined}>{item.name}</TextTooltip>
            </span>,
            <Badge>{t(kinds[item.kind])}</Badge>,
            n(item.node_count),
            used ? (used.total ? t('nodes.used', {used: formatBytes(used.used), total: formatBytes(used.total)}) : formatBytes(used.used)) : '—',
            <TextTooltip text={item.updated_at ? localTime(item.updated_at, locale) : undefined}>{relativeStart(item.updated_at, locale)}</TextTooltip>,
            item.expires_at ? localTime(item.expires_at, locale) : '—',
            <Light small tone={tones[item.status]}>
              <TextTooltip text={item.last_error?.message}>{t(statuses[item.status])}</TextTooltip>
            </Light>,
            item.kind === 'subscription' && resources?.providers.can_refresh ? (
              <Button
                small
                quiet
                isPending={refresh.busy === item.id}
                isDisabled={!!refresh.busy}
                label={t('nodes.refresh', {name: item.name})}
                onPress={() => {
                  void refresh.refresh(item.id).then(
                    result => {
                      if (result)
                        toast(
                          'positive',
                          t('nodes.refreshed', {name: item.name, n: n(result.kind === 'provider_refresh' ? result.result.node_count : item.node_count)})
                        );
                    },
                    (error: unknown) => toast('negative', errorText(error))
                  );
                }}
              >
                <Refresh />
              </Button>
            ) : (
              ''
            )
          ];
        }}
      />
      <DataTable
        label={provider ? t('nodes.of', {name: provider.name}) : t('nav.nodes')}
        loading={nodes.loading && !nodes.data}
        rows={members}
        height={520}
        empty={t('nodes.empty')}
        cols={[
          {id: 'name', label: t('nodes.node'), minWidth: 220, grow: 2, isRowHeader: true},
          {id: 'protocol', label: t('nodes.protocol'), minWidth: 120, grow: 0, drop: 2},
          {id: 'latency', label: t('nodes.latency'), minWidth: 110, grow: 0, align: 'end'},
          {id: 'groups', label: t('nodes.groups'), minWidth: 200, drop: 1}
        ]}
        render={(node: Node) => {
          const health = preferredHealth(node);
          return [
            <span className="rp-chain">
              <Flag name={node.name} />
              <TextTooltip>{node.name}</TextTooltip>
            </span>,
            node.protocol ?? '—',
            health?.state === 'healthy' && health.latency_ms != null ? (
              <span className={'ms ' + latencyTone(health.latency_ms)}>{t('ui.latency', {n: health.latency_ms})}</span>
            ) : (
              <span className="ms err">{health?.state === 'unavailable' ? t('policy.unavailable') : '—'}</span>
            ),
            <TextTooltip>{node.group_ids.join(', ') || '—'}</TextTooltip>
          ];
        }}
      />
    </div>
  );
}
