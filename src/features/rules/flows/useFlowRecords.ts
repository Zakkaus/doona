import {useMemo} from 'react';
import {useCapabilities, useFlow, useFlows, useOutboundNames, useRules, type FlowFilter} from '../../../store';
import {connectionStates, outboundLabel} from '../../../api/selectors';
import {useLang, useT} from '../../../i18n';
import {within} from '../../../shell/route';
import {panelQuery, useMediaQuery} from '../../../ui/ui';
import type {PageProps} from '../../../shell/routes';
import {flowsThrough, pinnedLabel} from './map';
import {flowDetailView, flowRecordsView} from './view';
import {offered} from '../../../api/capabilities';

export function useFlowRecords({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const wide = useMediaQuery(panelQuery);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  // Filters live in the address, so they survive a tab switch like the other pages' filters.
  const requestedNetwork = params.get('network');
  const network: NonNullable<FlowFilter['network']> = requestedNetwork === 'tcp' || requestedNetwork === 'udp' ? requestedNetwork : 'all';
  const requestedState = params.get('state') ?? '';
  const state = (Object.hasOwn(connectionStates, requestedState) ? requestedState : 'all') as NonNullable<FlowFilter['state']>;
  const connectionId = params.get('connection_id') ?? undefined;
  const resources = useCapabilities().data?.resources;
  const resource = useFlows({connection_id: connectionId, network, state}, offered(resources, 'flows', {whileLoading: true}));
  const rulesListed = offered(resources, 'rules', {whileLoading: false});
  const rules = useRules(rulesListed);
  const canAdd = rulesListed && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const names = useOutboundNames();
  const id = params.get('id');
  const detail = useFlow(id);
  const pinned = params.get('path');
  const shown = useMemo(() => {
    const all = resource.data?.flows ?? [];
    return pinned ? flowsThrough(all, pinned, rules.data?.rules ?? []) : all;
  }, [resource.data, pinned, rules.data]);
  const view = useMemo(() => flowRecordsView(shown, resource.data, names, t, lang), [shown, resource.data, names, t, lang]);
  const row = view.rows.find(flow => flow.id === id);
  const detailView = useMemo(() => flowDetailView(detail.data ?? undefined, canAdd, t, lang, row), [detail.data, canAdd, t, lang, row]);
  return {
    ...view,
    detail: detailView,
    network,
    setNetwork: (value: string) => go('rules', within(query, {network: value === 'all' ? null : value})),
    state,
    setState: (value: string) => go('rules', within(query, {state: value === 'all' ? null : value})),
    wide,
    id,
    rulesListed,
    error: resource.error,
    retry: resource.refetch,
    loading: resource.loading && !resource.data,
    panelOpen: !!id && (!!detail.data || detail.loading || !!detail.error),
    panelTitle: detailView?.title ?? id ?? '',
    detailError: detail.error,
    detailRetry: detail.refetch,
    detailLoading: !detail.data && detail.loading,
    // Opening a record adds a history entry; moving between records or closing replaces it, so Back skips the rows.
    select: (value: string | null) => go('rules', within(query, {id: value}), {replace: id !== null}),
    pinLabel: pinned
      ? t('flow.mapFilter', {
          label: pinnedLabel(pinned, rules.data?.rules ?? [], names, name => (name === null ? t('flow.mapUnknown') : outboundLabel(name, t)))
        })
      : null,
    clearPin: () => go('rules', within(query, {path: null})),
    connectionLabel: connectionId ? t('flow.connectionFilter', {id: connectionId}) : null,
    clearConnection: () => go('rules', within(query, {connection_id: null}))
  };
}
