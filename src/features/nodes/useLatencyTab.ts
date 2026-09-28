import {useMemo, useState} from 'react';
import {useCapabilities, useGroups, useNodes, useProviders} from '../../store';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';
import {latencyGroups, type LatencyBy} from './latencyGroups';

export function useLatencyTab() {
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: true}));
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  // The list the page's sources table reads, so each row can open its node under the same owner.
  const providers = useProviders(offered(resources, 'providers', {whileLoading: true}));
  const [by, setBy] = useState<LatencyBy>('group');
  const view = useMemo(() => latencyGroups(nodes.data ?? [], groups.data, by), [nodes.data, groups.data, by]);
  const hrefs = useMemo(
    () => new Map((nodes.data ?? []).map(node => [node.id, nodeHref(node, providers.data?.providers ?? [])])),
    [nodes.data, providers.data]
  );
  return {nodes, by, setBy, view, hrefs};
}
