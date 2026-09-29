import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';

export type NodeTab = 'list' | 'latency';
// Latency is measured per node, so a backend that lists providers but no nodes gets the list alone, without tabs.
export function nodesTabs(resources: Capabilities['resources'] | undefined): Array<{id: NodeTab; titleKey: Key}> {
  if (!offered(resources, 'nodes', {whileLoading: true})) return [];
  return [
    {id: 'list', titleKey: 'nodes.tab.list'},
    {id: 'latency', titleKey: 'nodes.tab.latency'}
  ];
}
