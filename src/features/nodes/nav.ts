import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';
import type {SearchTarget} from '../../shell/routes';

export type NodeTab = 'list' | 'latency';
// Latency is measured per node, so a backend that lists providers but no nodes gets the list alone, without tabs.
export function nodesTabs(resources: Capabilities['resources'] | undefined): Array<{id: NodeTab; titleKey: Key}> {
  if (!offered(resources, 'nodes', {whileLoading: true})) return [];
  return [
    {id: 'list', titleKey: 'nodes.tab.list'},
    {id: 'latency', titleKey: 'nodes.tab.latency'}
  ];
}

// Where node sources are added and edited, for search: subscriptions on the sources list, share links and renames on
// the node list.
export function nodesTargets(resources: Capabilities['resources'] | undefined): SearchTarget[] {
  return [
    ...(offered(resources, 'providers', {whileLoading: false})
      ? [
          {
            id: 'nodes:sources',
            titleKey: 'search.providers',
            parentKey: 'nav.nodes',
            route: 'nodes',
            aliases: ['subscription', 'subscriptions'],
            aliasKeys: ['config.kind.subscription']
          } as const
        ]
      : []),
    ...(resources?.providers.can_manage
      ? [
          {
            id: 'nodes:add-subscription',
            titleKey: 'nodes.addProvider',
            parentKey: 'nav.nodes',
            route: 'nodes',
            params: {add: 'subscription'},
            aliases: ['subscription']
          } as const
        ]
      : []),
    ...(resources?.nodes.can_manage && nodesTabs(resources).length
      ? [
          {
            id: 'nodes:link',
            titleKey: 'nodes.addNode',
            parentKey: 'nav.nodes',
            route: 'nodes',
            params: {tab: 'list'},
            aliases: ['share link', 'rename']
          } as const
        ]
      : [])
  ];
}
