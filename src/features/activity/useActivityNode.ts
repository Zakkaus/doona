import {useContext, useEffect, useMemo, useState} from 'react';
import {ResourcePreview} from '../../store/preview';
import {useCapabilities, useGroups, useNodes, useProviders, useConnections, poll} from '../../store';
import {useT} from '../../i18n';
import {activityGroupView} from './view';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';
import {storageKeys} from '../../api/storage';
import type {ConnectionList, Node} from '../../api/model';
import {serverNow} from '../../api/serverClock';
import {foldCpu, nextLatency, sparkWindow, type LatencyHistory} from '../shared/widgetSeries';
import {trafficRanges} from '../shared/traffic';

export function useActivityNode(connections: ConnectionList | undefined, selection?: {chosen: string; setChosen: (id: string) => void}) {
  const t = useT();
  const capabilities = useCapabilities();
  const nodes = useNodes(offered(capabilities.data?.resources, 'nodes', {whileLoading: false}));
  const groups = useGroups(offered(capabilities.data?.resources, 'groups', {whileLoading: false}));
  const [legacyChosen, choose] = useState(() => {
    try {
      return localStorage.getItem(storageKeys.activityGroup) ?? '';
    } catch {
      return '';
    }
  });
  const saved = selection?.chosen ?? legacyChosen;
  const chosen = groups.data && !groups.loading && !groups.error && !groups.data.some(group => group.id === saved) ? '' : saved;
  const setChosen = selection?.setChosen ?? choose;
  // A preview may read sample groups that lack the saved one, so only a live card clears a stale choice.
  const preview = useContext(ResourcePreview);
  useEffect(() => {
    if (saved && !chosen && !preview) setChosen('');
  }, [saved, chosen, setChosen, preview]);
  useEffect(() => {
    if (selection) return;
    try {
      if (chosen) localStorage.setItem(storageKeys.activityGroup, chosen);
      else localStorage.removeItem(storageKeys.activityGroup);
    } catch {
      // The picker still works when browser storage is unavailable.
    }
  }, [chosen, selection]);
  const followed = useConnections(undefined, !connections && !chosen && capabilities.data?.resources.connections.available === true, false, poll.summary);
  const snapshot = connections ?? followed.data;
  const view = useMemo(() => activityGroupView(groups.data ?? [], nodes.data ?? [], chosen, t, snapshot), [groups.data, nodes.data, chosen, t, snapshot]);
  const node = nodes.data?.find(item => item.id === view.id);
  // Only a node without a provider needs the list, to spell the stand-in owner the nodes page files it under.
  const providers = useProviders(!!node && node.provider_id == null && offered(capabilities.data?.resources, 'providers', {whileLoading: false}));
  const href = node ? nodeHref(node, providers.data?.providers ?? []) : undefined;
  return {
    ...view,
    nodes: nodes.data,
    href,
    setChosen,
    loading: capabilities.loading || (nodes.loading && !nodes.data) || (groups.loading && !groups.data),
    error: groups.error ?? nodes.error,
    retry: () => {
      groups.refetch();
      nodes.refetch();
    }
  };
}

// The backend keeps no latency history, so the card records its node's latency at each read of the node list that
// brings a change. The history is the card's own, kept in memory for the ten minutes the line
// shows, and restarts when the card's selection changes or the line is switched back on; a preview records nothing.
export function useLatencySpark(nodes: Node[] | undefined, id: string, key: string, enabled: boolean) {
  const preview = useContext(ResourcePreview);
  const source = enabled && !preview ? nodes : undefined;
  const current = enabled ? key : null;
  const [history, setHistory] = useState<LatencyHistory>({source: undefined, key: current, samples: []});
  if (history.source !== source || history.key !== current) setHistory(nextLatency(history, source, id, current, serverNow(), trafficRanges.m10.seconds));
  return useMemo(() => sparkWindow({fine: history.samples, coarse: []}, trafficRanges.m10.seconds, foldCpu), [history.samples]);
}
