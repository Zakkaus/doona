import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useCapabilities, useGroups, useNodes} from '../../store';
import {preferredHealth} from '../../api/selectors';
import {useMainSourceEdit} from '../../store/mainSource';
import {readGroupEntries} from '../../dae/groups';
import type {HealthObservation} from '../../api/model';
import {sameHealth} from './health';
import type {PageProps} from '../../shell/routes';
import {pickTab, tabQuery} from '../../shell/route';
import {offered} from '../../api/capabilities';
import {useNearViewport} from '../../ui/ui';

export function usePolicies({go, query}: PageProps) {
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(offered(resources, 'groups', {whileLoading: true}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  const focus = new URLSearchParams(query).get('group');
  const [health, setHealth] = useState<{from: typeof nodes.data; map: Map<string, HealthObservation | undefined>}>({from: undefined, map: new Map()});
  if (health.from !== nodes.data) {
    const map = new Map((nodes.data ?? []).map(node => [node.id, preferredHealth(node)]));
    setHealth({from: nodes.data, map: sameHealth(health.map, map) ? health.map : map});
  }
  const sourceState = useMainSourceEdit();
  const {main, writable, busy, apply, error, retry} = sourceState;
  const source = useMemo(() => ({main, writable, busy, apply, error, retry}), [main, writable, busy, apply, error, retry]);
  const entries = useMemo(() => new Map(readGroupEntries(source.main?.content ?? '').map(entry => [entry.name, entry])), [source.main?.content]);
  const cards = useMemo(
    () =>
      (groups.data ?? []).map(group => ({
        id: group.id,
        domId: 'group-' + group.id,
        name: group.name,
        members: group.member_count,
        entry: entries.get(group.name)
      })),
    [groups.data, entries]
  );
  const ready = !!groups.data;
  // Cards above the linked one may still settle as their details mount, so the target is followed briefly,
  // once per link, and never after the user starts moving the page themselves.
  useEffect(() => {
    const target = focus && ready ? document.getElementById('group-' + focus) : null;
    if (!target) return;
    const scroll = () => target.scrollIntoView({block: 'start'});
    scroll();
    const observer = new ResizeObserver(scroll);
    for (const card of target.parentElement?.children ?? []) {
      if (card === target) break;
      observer.observe(card);
    }
    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const stop = () => {
      clearTimeout(settle);
      observer.disconnect();
      for (const type of inputs) removeEventListener(type, stop, true);
    };
    const settle = setTimeout(stop, 3000);
    for (const type of inputs) addEventListener(type, stop, {capture: true, passive: true});
    return stop;
  }, [focus, ready]);
  const {refetch: refreshGroups} = groups;
  const {refetch: refreshNodes} = nodes;
  const reload = useCallback(() => {
    refreshGroups();
    refreshNodes();
  }, [refreshGroups, refreshNodes]);
  return {
    tab: pickTab(query, ['groups', 'arrange'], 'groups'),
    setTab: (next: string) => go('policies', tabQuery(query, next, 'groups')),
    cards,
    focus,
    health: health.map,
    source,
    error: groups.error ?? nodes.error,
    loading: groups.loading && !groups.data,
    empty: groups.data?.length === 0,
    reload,
    refreshGroups: groups.refetch,
    refreshNodes: nodes.refetch,
    groups: groups.data
  };
}
// A card mounts its details the first time it nears the viewport and keeps them; `visible` follows the viewport.
export function usePolicyVisibility(focused: boolean) {
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLElement | null>(null);
  // Expanding removes the focused placeholder button, so the card itself takes focus instead of the page body.
  const refocus = useRef(false);
  const open = useCallback(() => {
    refocus.current = !!card.current?.contains(document.activeElement);
    setExpanded(true);
  }, []);
  const [nearRef, visible] = useNearViewport(open);
  const ref = useCallback(
    (element: HTMLElement | null) => {
      card.current = element;
      return nearRef(element);
    },
    [nearRef]
  );
  const active = focused || expanded;
  useLayoutEffect(() => {
    if (!active || !refocus.current) return;
    refocus.current = false;
    if (!card.current?.contains(document.activeElement)) card.current?.focus();
  }, [active]);
  return {ref, active, visible, expand: open};
}
