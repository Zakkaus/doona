import {useCallback, useLayoutEffect, useMemo, useRef} from 'react';
import {useCapabilities, useFlows, useGroups, useNodes, useRules} from '../../store';
import {useT} from '../../i18n';
import {within} from '../../shell/route';
import type {PageProps} from '../types';
import {flowsThrough, routingTree, type TreeBy} from './map';
import {routingMapView} from './view';

export function useRoutingMap({go, query}: PageProps) {
  const t = useT();
  const params = new URLSearchParams(query);
  const resource = useFlows();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const rules = useRules(resources?.rules.available === true);
  const by: TreeBy = params.get('by') === 'client' ? 'client' : 'rule';
  const tree = useMemo(
    () => routingTree(resource.data?.flows ?? [], groups.data ?? [], nodes.data ?? [], rules.data?.rules ?? [], by),
    [resource.data, groups.data, nodes.data, rules.data, by]
  );
  const pinned = params.get('path');
  // Memoised tree tiles keep one `pin` across navigations; the query is read when the tile is pressed.
  const latest = useRef(query);
  useLayoutEffect(() => {
    latest.current = query;
  }, [query]);
  const pin = useCallback((path: string | null) => go('rules', within(latest.current, {path})), [go]);
  const count = useMemo(
    () => (pinned ? flowsThrough(resource.data?.flows ?? [], pinned, rules.data?.rules ?? []).length : 0),
    [resource.data, pinned, rules.data]
  );
  // The tree waits for all three sources so it is laid out once rather than growing as each one lands.
  const settled = [resource, rules, groups].every(item => item.data !== undefined || item.error || !item.loading);
  return {
    ...routingMapView(tree, settled && !!(resource.data || rules.data || groups.data), !!resource.error, pinned, count, t),
    by,
    pinned,
    error: resource.error ?? groups.error ?? nodes.error ?? rules.error,
    retry: () => {
      resource.refetch();
      groups.refetch();
      nodes.refetch();
      rules.refetch();
    },
    pin,
    changeBy: (next: string) => go('rules', within(query, {by: next === 'client' ? 'client' : null, path: null})),
    viewPinned: () => go('rules', within(query, {tab: 'flows'}))
  };
}
