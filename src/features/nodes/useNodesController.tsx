import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useT, useLang, LOCALE, formatList, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useNodeManage, useNodeProbe, useNodes, useOutboundNames, useProviderRefresh, useProviders} from '../../api/store';
import type {Node, Provider} from '../../api/model';
import {addU64, formatBytes, millis} from '../../api/u64';
import {formatDuration, localTime, preferredHealth, relativeStart} from '../../api/selectors';
import {useMainSourceEdit} from '../config/mainSource';
import {addNamesToGroup, namedIn, readGroupEntries} from '../config/groups';
import {Badge, Button, Light, MenuButton, TextTooltip, errorText, latencyTone, toast, useLinked, type TableSort} from '../../ui/ui';
import type {Col} from '../../ui/Table';
import Refresh from '../../ui/icons/Refresh';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import SpeedFast from '../../ui/icons/SpeedFast';
import type {PageProps} from '../types';
import {readSubscriptions, writeInterval} from './subscriptions';
import {collator, INLINE, nodeRows, ownedNodes, providerRows} from './view';

export type NodeDialog =
  {kind: 'provider'} | {kind: 'node'} | {kind: 'group'; item: Node} | {kind: 'removeProvider'; item: Provider} | {kind: 'removeNode'; item: Node};

const INTERVALS = [3600, 21600, 43200, 86400];
// Group names cannot start with a slash.
const NEW_GROUP = '/new';
const kinds: Record<Provider['kind'], Key> = {subscription: 'nodes.kind.subscription', file: 'nodes.kind.file', inline: 'nodes.kind.inline'};
const tones = {ok: 'ok', stale: 'warn', error: 'err'} as const;
const statuses: Record<Provider['status'], Key> = {ok: 'nodes.status.ok', stale: 'nodes.status.stale', error: 'nodes.status.error'};
export const fail = (error: unknown) => toast('negative', errorText(error));

export function useNodesController({go, query}: PageProps, open: (dialog: NodeDialog) => void) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const n = useCallback((value: number) => formatNumber(value, locale), [locale]);
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(resources?.providers.available !== false);
  const nodes = useNodes(resources?.nodes.available !== false);
  const {refetch: refetchProviders} = providers;
  const {refetch: refetchNodes} = nodes;
  const reload = useCallback(() => {
    refetchProviders();
    refetchNodes();
  }, [refetchProviders, refetchNodes]);
  const refresh = useProviderRefresh(reload);
  const manage = useNodeManage(reload);
  const source = useMainSourceEdit();
  const probe = useNodeProbe(refetchNodes);
  // Store actions are recreated on render; event handlers use their latest committed versions.
  const actions = useRef({apply: source.apply, refresh: refresh.refresh, probe: probe.probe});
  useLayoutEffect(() => {
    actions.current = {apply: source.apply, refresh: refresh.refresh, probe: probe.probe};
  }, [source.apply, refresh.refresh, probe.probe]);
  const entries = useMemo(() => readSubscriptions(source.main?.content ?? ''), [source.main?.content]);
  const intervals = useMemo(() => new Map(entries.map(e => [e.tag, e.interval])), [entries]);
  const intervalLabel = useCallback(
    (seconds: number) =>
      seconds === 0
        ? t('nodes.manualOnly')
        : INTERVALS.includes(seconds)
          ? t('nodes.everyHours', {n: n(seconds / 3600)})
          : formatDuration(String(seconds), locale),
    [t, n, locale]
  );
  const setInterval = useCallback(
    (name: string, seconds: number) => {
      void actions.current
        .apply(
          text => writeInterval(text, name, seconds),
          errors => toast('negative', t('nodes.writeInvalid', {n: n(errors)}))
        )
        .then(written => {
          if (written) toast('positive', t('nodes.intervalSet', {name, interval: intervalLabel(seconds)}));
        }, fail);
    },
    [t, n, intervalLabel]
  );
  const groupEntries = useMemo(() => readGroupEntries(source.main?.content ?? ''), [source.main?.content]);
  const joinGroup = useCallback(
    (node: Node, group: string) => {
      void actions.current
        .apply(
          text => addNamesToGroup(text, group, [node.name]),
          errors => toast('negative', t('nodes.writeInvalid', {n: n(errors)}))
        )
        .then(written => {
          if (written) toast('positive', t('nodes.joined', {name: node.name, group}));
        }, fail);
    },
    [t, n]
  );
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const names = useOutboundNames();
  const {list, synthetic} = useMemo(
    () => providerRows(providers.data?.providers ?? [], nodes.data ?? [], entries, t('nodes.kind.inline')),
    [providers.data, nodes.data, entries, t]
  );
  const selectedId = params.get('provider') ?? list[0]?.id ?? null;
  const provider = list.find(item => item.id === selectedId) ?? null;
  const ownerId = provider && synthetic && provider.id === INLINE ? null : provider?.id;
  const select = useCallback(
    (id: string | null) => {
      if (!id) return;
      const next = new URLSearchParams(query);
      next.set('provider', id);
      go('nodes', next.toString());
    },
    [go, query]
  );
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  useLinked(params.get('q'), value => setSearch(value ?? ''));
  const [group, setGroup] = useState('');
  const [protocol, setProtocol] = useState('');
  const [sort, setSort] = useState<TableSort>({column: 'name', direction: 'ascending'});
  const inlineId = list.find(item => item.kind === 'inline')?.id ?? null;
  const owned = useMemo(() => ownedNodes(nodes.data ?? [], ownerId), [nodes.data, ownerId]);
  const groups = useMemo(
    () => [...new Set(owned.flatMap(node => node.group_ids))].sort((a, b) => collator.compare(names.get(a) ?? a, names.get(b) ?? b)),
    [owned, names]
  );
  const protocols = useMemo(() => [...new Set(owned.map(node => node.protocol ?? ''))].filter(Boolean).sort(collator.compare), [owned]);
  const members = useMemo(() => nodeRows(owned, search, group, protocol, sort), [owned, search, group, protocol, sort]);
  const canManageProviders = !!resources?.providers.can_manage;
  const canManageNodes = !!resources?.nodes.can_manage;
  const canRefresh = resources?.providers.can_refresh;
  const {canProbe, busy: probeBusy} = probe;
  const {busy: refreshBusy} = refresh;
  const {busy: manageBusy} = manage;
  const {writable, busy: sourceBusy} = source;
  const providerColumns = useMemo<Col[]>(
    () => [
      {id: 'name', label: t('nodes.provider'), minWidth: 140, grow: 2, isRowHeader: true},
      {id: 'kind', label: t('nodes.kindLabel'), minWidth: 110, grow: 0, drop: 5},
      {id: 'count', label: t('nodes.count'), minWidth: 80, grow: 0, align: 'end', drop: 6},
      {id: 'usage', label: t('nodes.usage'), minWidth: 200, drop: 2},
      {id: 'updated', label: t('nodes.updated'), minWidth: 140, drop: 3},
      {id: 'interval', label: t('nodes.interval'), minWidth: 130, grow: 0, drop: 4},
      {id: 'expires', label: t('nodes.expires'), minWidth: 140, drop: 1},
      {id: 'status', label: t('ui.state'), minWidth: 96, grow: 0},
      {id: 'actions', label: t('ui.actions'), minWidth: canManageProviders ? 112 : 88, grow: 0}
    ],
    [t, canManageProviders]
  );
  const nodeColumns = useMemo<Col[]>(
    () => [
      {id: 'name', label: t('nodes.node'), minWidth: 150, grow: 2, isRowHeader: true, sortable: true},
      {id: 'protocol', label: t('nodes.protocol'), minWidth: 120, grow: 0, drop: 2, sortable: true},
      {id: 'latency', label: t('nodes.latency'), minWidth: 96, grow: 0, align: 'end', sortable: true},
      {id: 'groups', label: t('nodes.groups'), minWidth: 200, drop: 1},
      {id: 'actions', label: t('ui.actions'), minWidth: canManageNodes ? 108 : 72, grow: 0}
    ],
    [t, canManageNodes]
  );
  const renderProvider = useCallback(
    (item: Provider) => {
      const used = item.traffic ? {used: addU64(item.traffic.upload_bytes, item.traffic.download_bytes), total: item.traffic.total_bytes} : null;
      const interval = item.kind === 'subscription' ? intervals.get(item.name) : undefined;
      return [
        <span className="rp-chain">
          <TextTooltip text={item.url_redacted ?? undefined}>{item.name}</TextTooltip>
        </span>,
        <Badge>{t(kinds[item.kind])}</Badge>,
        n(item.node_count),
        used ? (used.total ? t('nodes.used', {used: formatBytes(used.used), total: formatBytes(used.total)}) : formatBytes(used.used)) : '—',
        <TextTooltip text={item.updated_at ? localTime(item.updated_at, locale) : undefined}>{relativeStart(item.updated_at, locale)}</TextTooltip>,
        interval === undefined ? (
          '—'
        ) : writable ? (
          <MenuButton
            quiet
            label={t('nodes.intervalOf', {name: item.name})}
            value={String(interval)}
            isDisabled={sourceBusy}
            onChange={key => setInterval(item.name, Number(key))}
            items={[0, ...INTERVALS, ...(INTERVALS.includes(interval) || interval === 0 ? [] : [interval])].map(seconds => ({
              id: String(seconds),
              label: intervalLabel(seconds)
            }))}
          >
            {intervalLabel(interval)}
          </MenuButton>
        ) : (
          intervalLabel(interval)
        ),
        item.expires_at ? localTime(item.expires_at, locale) : '—',
        <Light small tone={tones[item.status]}>
          <TextTooltip text={item.last_error?.message}>{t(statuses[item.status])}</TextTooltip>
        </Light>,
        <span className="rp-chain">
          {item.kind === 'subscription' && canRefresh && (
            <Button
              small
              quiet
              icon
              isPending={refreshBusy === item.id}
              isDisabled={!!refreshBusy}
              label={t('nodes.refresh', {name: item.name})}
              onPress={() => {
                void actions.current.refresh(item.id).then(result => {
                  if (result) toast('positive', t('nodes.refreshed', {name: item.name, n: n(result.node_count)}));
                }, fail);
              }}
            >
              <Refresh />
            </Button>
          )}
          {canManageProviders && item.kind !== 'inline' && (
            <Button small quiet isDisabled={!!manageBusy} label={t('nodes.remove', {name: item.name})} onPress={() => open({kind: 'removeProvider', item})}>
              <Close />
            </Button>
          )}
        </span>
      ];
    },
    [intervals, t, n, locale, writable, sourceBusy, setInterval, intervalLabel, canRefresh, refreshBusy, canManageProviders, manageBusy, open]
  );
  const renderNode = useCallback(
    (node: Node) => {
      const health = preferredHealth(node);
      return [
        <span className="rp-chain">
          <TextTooltip>{node.name}</TextTooltip>
        </span>,
        node.protocol ?? '—',
        health?.state === 'healthy' && health.latency_ms != null ? (
          <span className={'ms ' + latencyTone(health.latency_ms)}>{t('ui.latency', {n: millis(health.latency_ms)})}</span>
        ) : (
          <span className="ms err">{health?.state === 'unavailable' ? t('ui.unavailable') : '—'}</span>
        ),
        <TextTooltip>
          {node.group_ids.length
            ? formatList(
                lang,
                node.group_ids.map(id => names.get(id) ?? id)
              )
            : '—'}
        </TextTooltip>,
        <span className="rp-chain">
          {canProbe && node.protocol !== 'direct' && node.protocol !== 'block' && (
            <Button
              small
              quiet
              icon
              isPending={probeBusy === node.id}
              isDisabled={!!probeBusy}
              label={t('nodes.probe', {name: node.name})}
              onPress={() => {
                void actions.current.probe(node.id).then(result => {
                  if (!result) return;
                  const sample = result.results.find(item => item.member_id === node.id && item.state === 'healthy' && item.latency_ms != null);
                  toast(
                    sample ? 'positive' : 'negative',
                    sample ? t('nodes.probed', {name: node.name, n: n(sample.latency_ms!)}) : t('nodes.probeFailed', {name: node.name})
                  );
                }, fail);
              }}
            >
              <SpeedFast />
            </Button>
          )}
          {writable && (
            <MenuButton
              quiet
              chevron={false}
              label={t('nodes.joinGroup', {name: node.name})}
              value=""
              isDisabled={sourceBusy}
              onChange={key => (key === NEW_GROUP ? open({kind: 'group', item: node}) : joinGroup(node, key))}
              items={[
                ...groupEntries
                  .filter(entry => !namedIn(entry).includes(node.name) && !node.group_ids.some(id => (names.get(id) ?? id) === entry.name))
                  .map(entry => ({id: entry.name, label: entry.name, desc: entry.policy ?? 'selector'})),
                {id: NEW_GROUP, label: t('nodes.newGroup')}
              ]}
            >
              <AddCircle />
            </MenuButton>
          )}
          {canManageNodes && inlineId !== null && node.provider_id === (synthetic && inlineId === INLINE ? null : inlineId) && (
            <Button small quiet isDisabled={!!manageBusy} label={t('nodes.remove', {name: node.name})} onPress={() => open({kind: 'removeNode', item: node})}>
              <Close />
            </Button>
          )}
        </span>
      ];
    },
    [t, lang, names, canProbe, probeBusy, n, writable, sourceBusy, open, joinGroup, groupEntries, canManageNodes, inlineId, synthetic, manageBusy]
  );

  return {
    providers,
    nodes,
    reload,
    manage,
    source,
    joinGroup,
    n,
    names,
    list,
    selectedId,
    provider,
    select,
    search,
    setSearch,
    group,
    setGroup,
    protocol,
    setProtocol,
    sort,
    setSort,
    owned,
    groups,
    protocols,
    members,
    canManageProviders,
    canManageNodes,
    providerColumns,
    nodeColumns,
    renderProvider,
    renderNode
  };
}
