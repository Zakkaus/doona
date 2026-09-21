import {useMemo, useState} from 'react';
import {useCapabilities, useFlow, useFlows, useOutboundNames, useRules, type FlowFilter} from '../../store';
import {outboundLabel} from '../../api/selectors';
import {useLang, useT} from '../../i18n';
import {within} from '../../shell/route';
import {panelQuery, useMediaQuery} from '../../ui/ui';
import type {PageProps} from '../types';
import {flowsThrough, pinnedLabel} from './map';
import {flowRecordsView} from './view';

export function useFlowRecords({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const [network, setNetwork] = useState<NonNullable<FlowFilter['network']>>('all');
  const [state, setState] = useState<NonNullable<FlowFilter['state']>>('all');
  const wide = useMediaQuery(panelQuery);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const connectionId = params.get('connection_id') ?? undefined;
  const resource = useFlows({connection_id: connectionId, network, state});
  const resources = useCapabilities().data?.resources;
  const rulesListed = resources?.rules.available === true;
  const rules = useRules(rulesListed);
  const canAdd = rulesListed && resources?.config.available === true && resources.config.writable === true;
  const names = useOutboundNames();
  const id = params.get('id');
  const detail = useFlow(id);
  const pinned = params.get('path');
  const shown = useMemo(() => {
    const all = resource.data?.flows ?? [];
    return pinned ? flowsThrough(all, pinned, names, rules.data?.rules ?? []) : all;
  }, [resource.data, pinned, names, rules.data]);
  const view = useMemo(
    () => flowRecordsView(shown, detail.data ?? undefined, resource.data, names, canAdd, t, lang),
    [shown, detail.data, resource.data, names, canAdd, t, lang]
  );
  return {
    ...view,
    network,
    setNetwork: (value: string) => setNetwork(value as NonNullable<FlowFilter['network']>),
    state,
    setState: (value: string) => setState(value as NonNullable<FlowFilter['state']>),
    wide,
    id,
    rulesListed,
    error: resource.error,
    loading: resource.loading && !resource.data,
    panelOpen: !!id && (!!detail.data || detail.loading || !!detail.error),
    panelTitle: view.detail?.title ?? id ?? '',
    detailError: detail.error,
    detailRetry: detail.refetch,
    detailLoading: !detail.data && detail.loading,
    select: (value: string | null) => go('rules', within(query, {id: value})),
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
