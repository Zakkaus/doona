import {useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {ResourcePreview} from '../../store/preview';
import {useCapabilities, useGroups, useNodes, useProviders, useConnections, poll} from '../../store';
import {useT} from '../../i18n';
import {activityGroupView} from './view';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';
import {storageKeys} from '../../api/storage';
import type {ConnectionList, Node} from '../../api/model';
import {serverNow} from '../../api/serverClock';
import {foldCpu, latencySample, sparkWindow} from '../shared/widgetSeries';
import {trafficRanges} from '../shared/traffic';
import {clearRing, record, useRings} from '../../store/rings';
import {eventGap, type RefreshOutcome} from '../../store/resourceCore';

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
    refetchNodes: nodes.refetch,
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

// The node list each ring last sampled, so a card drawn again does not record the same reading twice.
const sampled = new Map<string, Node[]>();
const forget = (name: string) => {
  sampled.delete(name);
  clearRing(name);
};
// The backend keeps no latency history, so the card records its node's latency at each read of the node list that
// brings a change. The history is a ring kept like the CPU's, by selection and across visits; a preview (the dashboard
// editor draws its cards as previews) records nothing and shows the line its selection holds. The line restarts when
// the card's selection changes or it is switched off. A card that opens with fewer than two readings brings one read of
// the node list forward, an event gap after the list it has, so its line does not wait for the next inventory poll.
export function useLatencySpark(nodes: Node[] | undefined, id: string, key: string, enabled: boolean, refetch: () => Promise<RefreshOutcome> | undefined) {
  const preview = useContext(ResourcePreview);
  // Encoded, so storage keys carry no brackets for the ring pruner to take as their owner.
  const name = `latency-${encodeURIComponent(key)}`;
  const live = enabled && !preview && !!id;
  // A selection without a node is the list still loading, not a choice to start over from.
  const shown = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (preview) return;
    if (!enabled) {
      forget(name);
      shown.current = undefined;
    } else if (id) {
      if (shown.current !== undefined && shown.current !== name) {
        forget(shown.current);
        forget(name);
      }
      shown.current = name;
    }
  }, [name, id, enabled, preview]);
  const sample = useCallback(
    (source: Node[]) => {
      if (sampled.get(name) === source) return undefined;
      sampled.set(name, source);
      return latencySample(
        source.find(node => node.id === id),
        serverNow()
      );
    },
    [name, id]
  );
  const rings = useRings(name, live ? nodes : undefined, sample, foldCpu, enabled && !!id, preview);
  const spark = useMemo(() => sparkWindow(rings, trafficRanges.m10.seconds, foldCpu), [rings]);
  const short = spark.values.filter(value => value !== null).length < 2;
  const loaded = nodes !== undefined;
  const early = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!live || !loaded || !short || early.current === name) return;
    let active = true;
    const timer = setTimeout(() => {
      early.current = name;
      const before = sampled.get(name);
      void refetch()?.then(outcome => {
        // A changed list reaches the ring through the render it causes; an unchanged one keeps its identity and records
        // nothing, yet it is a reading, so it is recorded here once that render has had its turn.
        if (outcome.ok)
          setTimeout(() => {
            if (active && before && sampled.get(name) === before)
              record(
                name,
                latencySample(
                  before.find(node => node.id === id),
                  serverNow()
                ),
                foldCpu
              );
          }, 0);
      });
    }, eventGap);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [live, loaded, short, name, id, refetch]);
  return spark;
}
