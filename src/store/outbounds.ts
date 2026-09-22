import {useMemo} from 'react';
import type {OutboundNames} from '../api/selectors';
import {useCapabilities} from './runtime';
import {useGroups} from './groups';
import {useNodes} from './nodes';
export function useOutboundNames(): OutboundNames {
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  return useMemo(
    () => new Map([...(groups.data ?? []).map(g => [g.id, g.name] as const), ...(nodes.data ?? []).map(n => [n.id, n.name] as const)]),
    [groups.data, nodes.data]
  );
}
