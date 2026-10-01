import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useGroups, useNodes, useProviders} from '../../store';
import {useT} from '../../i18n';
import {activityGroupView} from './view';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';
import {storageKeys} from '../../api/storage';
import type {ConnectionList} from '../../api/model';

export function useActivityNode(connections: ConnectionList | undefined) {
  const t = useT();
  const capabilities = useCapabilities();
  const nodes = useNodes(offered(capabilities.data?.resources, 'nodes', {whileLoading: false}));
  const groups = useGroups(offered(capabilities.data?.resources, 'groups', {whileLoading: false}));
  const [chosen, choose] = useState(() => {
    try {
      return localStorage.getItem(storageKeys.activityGroup) ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    if (chosen && groups.data && !groups.loading && !groups.error && !groups.data.some(group => group.id === chosen)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile the persisted choice after the group snapshot commits.
      choose('');
    }
  }, [chosen, groups.data, groups.loading, groups.error]);
  useEffect(() => {
    try {
      if (chosen) localStorage.setItem(storageKeys.activityGroup, chosen);
      else localStorage.removeItem(storageKeys.activityGroup);
    } catch {
      // The picker still works when browser storage is unavailable.
    }
  }, [chosen]);
  const view = useMemo(() => activityGroupView(groups.data ?? [], nodes.data ?? [], chosen, t, connections), [groups.data, nodes.data, chosen, t, connections]);
  const node = nodes.data?.find(item => item.id === view.id);
  // Only a node without a provider needs the list, to spell the stand-in owner the nodes page files it under.
  const providers = useProviders(!!node && node.provider_id == null && offered(capabilities.data?.resources, 'providers', {whileLoading: false}));
  const href = node ? nodeHref(node, providers.data?.providers ?? []) : undefined;
  return {
    ...view,
    href,
    setChosen: choose,
    loading: capabilities.loading || (nodes.loading && !nodes.data) || (groups.loading && !groups.data),
    error: groups.error ?? nodes.error,
    retry: () => {
      groups.refetch();
      nodes.refetch();
    }
  };
}
