import {useMemo} from 'react';
import type {OutboundNames} from '../api/selectors';
import {useCapabilities} from './runtime';
import {useGroups} from './groups';
import {useNodes} from './nodes';
import {offered} from '../api/capabilities';
export function useOutboundNames(): OutboundNames {
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: false}));
  // Keyed on the names alone, so a poll that moves only health or selection keeps the map and what is built from it.
  const key = JSON.stringify([...(groups.data ?? []).map(g => [g.id, g.name]), ...(nodes.data ?? []).map(n => [n.id, n.name])]);
  return useMemo(() => new Map(JSON.parse(key) as Array<[string, string]>), [key]);
}
