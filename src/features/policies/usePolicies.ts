import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {poll, useCapabilities, useGroups, useNodes} from '../../store';
import {healthMillis, preferredHealth} from '../../api/selectors';
import {useMainSourceEdit} from '../../store/mainSource';
import {useCompleteness, useConfig} from '../../store/config';
import {groupKind, groupOwners, kindFilter, kindView, outboundLinks, type OutboundCatalogue} from './view';
import type {HealthObservation} from '../../api/model';
import {sameHealth} from './health';
import type {PageProps} from '../../shell/routes';
import {pickTab, tabQuery, within} from '../../shell/route';
import {offered} from '../../api/capabilities';
import {openGroup} from '../shared/openGroup';
import {useNearViewport} from '../../ui/ui';
import {policiesTabs} from './nav';
import {useT} from '../../i18n';

const policyTabIds = policiesTabs().map(tab => tab.id);

export function usePolicies({go, query}: PageProps) {
  const t = useT();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  // The list carries each group's selection, so a change made elsewhere shows within one live poll; the poll stops
  // while the tab is hidden and when the page is left.
  const groups = useGroups(offered(resources, 'groups', {whileLoading: true}), poll.live);
  const nodesOffered = offered(resources, 'nodes', {whileLoading: false});
  const nodes = useNodes(nodesOffered);
  const params = new URLSearchParams(query);
  const focus = params.get('group');
  const [health, setHealth] = useState<{from: typeof nodes.data; map: Map<string, HealthObservation | undefined>}>({from: undefined, map: new Map()});
  if (health.from !== nodes.data) {
    const map = new Map((nodes.data ?? []).map(node => [node.id, preferredHealth(node)]));
    setHealth({from: nodes.data, map: sameHealth(health.map, map) ? health.map : map});
  }
  const sourceState = useMainSourceEdit();
  const {main, writable, busy, apply, error, retry} = sourceState;
  const source = useMemo(() => ({main, writable, busy, apply, error, retry}), [main, writable, busy, apply, error, retry]);
  // A group is edited in the source that declares it, which need not be the main one.
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const sources = config.data?.sources;
  const owners = useMemo(() => groupOwners(sources ?? []), [sources]);
  const isComplete = useCompleteness(useMemo(() => sources ?? [], [sources]));
  const cards = useMemo(
    () =>
      (groups.data ?? []).map(group => {
        const owner = owners.get(group.name);
        return {
          id: group.id,
          domId: 'group-' + group.id,
          name: group.name,
          members: group.member_count,
          kind: groupKind(group.policy),
          selection: group.selection,
          declaration: {
            owner,
            complete: owner && owner !== 'ambiguous' ? isComplete(owner.origin) : undefined,
            loaded: !!sources,
            error: config.error
          }
        };
      }),
    [groups.data, owners, isComplete, sources, config.error]
  );
  // Rebuilt only when a name, a declaration or a shown latency changes, so a poll that changes none keeps the cards memoised.
  const groupKey = (groups.data ?? []).map(group => group.name).join('\n');
  const nodeKey = (nodes.data ?? []).map(node => `${node.id}\u0000${node.name}`).join('\n');
  const [named, setNamed] = useState<{key: string; nodes: Array<{id: string; name: string}>}>({key: '', nodes: []});
  if (named.key !== nodeKey) setNamed({key: nodeKey, nodes: (nodes.data ?? []).map(({id, name}) => ({id, name}))});
  const outbounds = useMemo<OutboundCatalogue>(
    () => ({
      groups: groupKey ? groupKey.split('\n') : [],
      nodes: named.nodes.map(node => {
        const observed = health.map.get(node.id);
        return {name: node.name, tcp: healthMillis(observed), alive: observed?.state === 'unavailable' ? false : undefined};
      }),
      links: outboundLinks(owners)
    }),
    [groupKey, named, health.map, owners]
  );
  const kinds = kindView(cards, kindFilter(params.get('kind')), focus, t);
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
    tab: pickTab(query, policyTabIds, 'groups'),
    // After an arrangement is written: the one group it changed, or the Groups tab when it changed several.
    viewGroup: (name: string | null) => (name === null ? go('policies') : openGroup(go, name)),
    setTab: (next: string) => go('policies', tabQuery(query, next, 'groups')),
    cards: kinds.shown,
    // The kind filter, in the query so a reload and Back keep it. Choosing one ends a link's hold on its group.
    kind: kinds.kind,
    kindItems: kinds.items,
    kindEmpty: kinds.empty,
    kindLabel: t('policy.kind.label'),
    setKind: (next: string) => go('policies', within(query, {kind: next === 'all' ? null : kindFilter(next), group: null})),
    showKinds: cards.length > 0,
    focus,
    health: health.map,
    outbounds,
    source,
    error: groups.error ?? nodes.error,
    // A card's size depends on its members' health as well, so the cards wait for the node list too, and for the
    // capabilities that say whether it is offered.
    loading: (groups.loading && !groups.data) || (!resources && !capabilities.error) || (nodesOffered && !nodes.data && !nodes.error),
    empty: groups.data?.length === 0,
    reload,
    refreshGroups: groups.refetch,
    refreshNodes: nodes.refetch,
    groups: groups.data
  };
}
// A card mounts its details the first time it nears the viewport and keeps them; `visible` follows the viewport.
// `onOpen` runs the first time the card opens, including in the ref of a card that mounts on screen.
export function usePolicyVisibility(focused: boolean, onOpen?: () => void) {
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLElement | null>(null);
  // Expanding removes the focused placeholder button, so the card itself takes focus instead of the page body.
  const refocus = useRef(false);
  const opened = useRef(false);
  const open = useCallback(() => {
    refocus.current = !!card.current?.contains(document.activeElement);
    // The viewport reports a card near again after its details have mounted; a focused card's details mount at once.
    if (!opened.current && !focused) onOpen?.();
    opened.current = true;
    setExpanded(true);
  }, [focused, onOpen]);
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
