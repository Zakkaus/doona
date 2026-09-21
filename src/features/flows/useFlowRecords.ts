import {useState} from 'react';
import {useCapabilities, useFlow, useFlows, useOutboundNames, useRules} from '../../api/store';
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
  const [network, setNetwork] = useState('all');
  const [state, setState] = useState('all');
  const wide = useMediaQuery(panelQuery);
  const params = new URLSearchParams(query);
  const connectionId = params.get('connection_id') ?? undefined;
  const resource = useFlows(connectionId);
  const resources = useCapabilities().data?.resources;
  const rulesListed = resources?.rules.available === true;
  const rules = useRules(rulesListed);
  const canAdd = rulesListed && resources?.config.available === true && resources.config.writable === true;
  const names = useOutboundNames();
  const id = params.get('id');
  const detail = useFlow(id);
  const pinned = params.get('path');
  const all = resource.data?.flows ?? [];
  const shown = (pinned ? flowsThrough(all, pinned, names, rules.data?.rules ?? []) : all).filter(
    flow => (network === 'all' || flow.network === network) && (state === 'all' || flow.state === state)
  );
  const view = flowRecordsView(shown, detail.data ?? undefined, resource.data, names, canAdd, t, lang);
  return {
    ...view,
    network,
    setNetwork,
    state,
    setState,
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
    pinLabel: pinned ? t('flow.mapFilter', {label: pinnedLabel(pinned, rules.data?.rules ?? [], names, name => outboundLabel(name, t))}) : null,
    clearPin: () => go('rules', within(query, {path: null})),
    connectionLabel: connectionId ? t('flow.connectionFilter', {id: connectionId}) : null,
    clearConnection: () => go('rules', within(query, {connection_id: null}))
  };
}
