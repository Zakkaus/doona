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
  return useMemo(
    () => new Map([...(groups.data ?? []).map(g => [g.id, g.name] as const), ...(nodes.data ?? []).map(n => [n.id, n.name] as const)]),
    [groups.data, nodes.data]
  );
}
