import {useMemo, useState} from 'react';
import {useCapabilities, useGroups, useNodes} from '../../store';
import {offered} from '../../api/capabilities';
import {latencyGroups, type LatencyBy} from './latency';

export function useLatencyTab() {
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: true}));
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const [by, setBy] = useState<LatencyBy>('group');
  const view = useMemo(() => latencyGroups(nodes.data ?? [], groups.data, by), [nodes.data, groups.data, by]);
  return {nodes, by, setBy, view};
}
