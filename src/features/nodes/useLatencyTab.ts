import {useMemo, useState} from 'react';
import {LOCALE, useLang} from '../../i18n';
import {useCapabilities, useGroups, useNodes, useProviders} from '../../store';
import {offered} from '../../api/capabilities';
import {nodeHref} from '../shared/link';
import {latencyGroups, type LatencyBy} from './latencyGroups';
import {useWhileShown} from '../../ui/ui';
import {useTabShown} from '../../ui/useTabShown';

export function useLatencyTab() {
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: true}));
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  // The list the page's sources table reads, so each row can open its node under the same owner.
  const providers = useProviders(offered(resources, 'providers', {whileLoading: true}));
  const [by, setBy] = useState<LatencyBy>('group');
  // A tab kept open behind another holds what it last showed and catches up when it is shown again.
  const shown = useTabShown();
  const nodeData = useWhileShown(nodes.data, shown);
  const groupData = useWhileShown(groups.data, shown);
  const providerData = useWhileShown(providers.data, shown);
  const view = useMemo(() => latencyGroups(nodeData ?? [], groupData, by, locale), [nodeData, groupData, by, locale]);
  const hrefs = useMemo(() => new Map((nodeData ?? []).map(node => [node.id, nodeHref(node, providerData?.providers ?? [], true)])), [nodeData, providerData]);
  return {nodes: {...nodes, data: nodeData}, by, setBy, view, hrefs};
}
