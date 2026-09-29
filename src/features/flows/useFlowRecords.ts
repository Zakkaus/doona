import {useMemo} from 'react';
import {useCapabilities, useFlow, useFlows, useOutboundNames, useRules, type FlowFilter} from '../../store';
import {connectionStates, outboundLabel} from '../../api/selectors';
import {useLang, useT} from '../../i18n';
import {within} from '../../shell/route';
import {panelQuery, useMediaQuery} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {flowsThrough, pinnedLabel} from './map';
import {flowDetailView, flowRecordsView} from './view';
import {offered} from '../../api/capabilities';
import {recordingSettingsHref} from '../shared/link';
import {useQuickRule} from '../shared/useQuickRule';

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
  const names = useOutboundNames();
  const id = params.get('id');
  const detail = useFlow(id);
  const pinned = params.get('path');
  const shown = useMemo(() => {
    const all = resource.data?.flows ?? [];
    return pinned ? flowsThrough(all, pinned, rules.data) : all;
  }, [resource.data, pinned, rules.data]);
  const generation = rules.data?.generation_id;
  const view = useMemo(() => flowRecordsView(shown, resource.data, generation, names, t, lang), [shown, resource.data, generation, names, t, lang]);
  const row = view.rows.find(flow => flow.id === id);
  const detailView = useMemo(() => flowDetailView(detail.data ?? undefined, t, lang, row), [detail.data, t, lang, row]);
  const quick = useQuickRule(go);
  return {
    ...view,
    detail: detailView,
    // The dialog keeps the record's input from when it opened, so it stays usable after the record expires.
    rule: {
      canAdd: !!detailView && quick.canAdd(detailView.seed),
      open: () => {
        if (detailView) quick.open(detailView.seed);
      },
      dialog: quick.dialog
    },
    network,
    setNetwork: (value: string) => go('flows', within(query, {network: value === 'all' ? null : value})),
    state,
    setState: (value: string) => go('flows', within(query, {state: value === 'all' ? null : value})),
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
    select: (value: string | null) => go('flows', within(query, {id: value}), {replace: id !== null}),
    pinLabel: pinned
      ? t('flow.mapFilter', {
          label: pinnedLabel(pinned, rules.data?.rules ?? [], names, name => (name === null ? t('flow.mapUnknown') : outboundLabel(name, t)))
        })
      : null,
    clearPin: () => go('flows', within(query, {path: null})),
    connectionLabel: connectionId ? t('flow.connectionFilter', {id: connectionId}) : null,
    clearConnection: () => go('flows', within(query, {connection_id: null})),
    // Whether flows are recorded and how many are kept is set in Settings.
    recordingHref: resources?.runtime_settings.available ? recordingSettingsHref : null
  };
}
