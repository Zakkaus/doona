import {useCallback, useEffect, useMemo, useState} from 'react';
import {useCapabilities, useGroups, useNodes} from '../../api/store';
import {preferredHealth} from '../../api/selectors';
import {useMainSourceEdit} from '../config/mainSource';
import {readGroupEntries} from '../config/groups';

export function usePolicies(query: string) {
  const resources = useCapabilities().data?.resources;
  const groups = useGroups();
  const nodes = useNodes(resources?.nodes.available === true);
  const focus = new URLSearchParams(query).get('group');
  const health = useMemo(() => new Map((nodes.data ?? []).map(node => [node.id, preferredHealth(node)])), [nodes.data]);
  const sourceState = useMainSourceEdit();
  const {main, writable, busy, apply} = sourceState;
  const source = useMemo(() => ({main, writable, busy, apply}), [main, writable, busy, apply]);
  const entries = useMemo(() => new Map(readGroupEntries(source.main?.content ?? '').map(entry => [entry.name, entry])), [source.main?.content]);
  const cards = useMemo(() => (groups.data ?? []).map(group => ({id: group.id, name: group.name, entry: entries.get(group.name)})), [groups.data, entries]);
  const ready = !!groups.data;
  // Cards above the linked one grow as their details mount, so the target is followed until the layout settles.
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
    const settle = setTimeout(() => observer.disconnect(), 3000);
    return () => {
      clearTimeout(settle);
      observer.disconnect();
    };
  }, [focus, ready]);
  const {refetch: refreshGroups} = groups;
  const {refetch: refreshNodes} = nodes;
  const reload = useCallback(() => {
    refreshGroups();
    refreshNodes();
  }, [refreshGroups, refreshNodes]);
  return {
    cards,
    focus,
    health,
    source,
    error: groups.error ?? nodes.error,
    loading: groups.loading && !groups.data,
    empty: groups.data?.length === 0,
    reload,
    refreshGroups: groups.refetch,
    refreshNodes: nodes.refetch
  };
}
export function usePolicyVisibility(focused: boolean) {
  const [expanded, setExpanded] = useState(false);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setExpanded(true);
      },
      {rootMargin: '400px'}
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return {ref, active: focused || expanded, expand: () => setExpanded(true)};
}
