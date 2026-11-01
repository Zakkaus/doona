import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import {nodesTabs} from './tabs';
import type {SearchTarget} from '../../shell/routes';

// The tabs are read apart from the search targets, so the startup Skeleton does not load these.
export {nodesTabs};

// Where node sources are added and edited, for search: subscriptions on the sources list, share links and renames on
// the node list.
export function nodesTargets(resources: Capabilities['resources'] | undefined): SearchTarget[] {
  return [
    ...(offered(resources, 'providers', {whileLoading: false})
      ? [
          {
            id: 'nodes:sources',
            titleKey: 'nodes.providers',
            parentKey: 'nav.nodes',
            route: 'nodes',
            aliases: ['subscription', 'subscriptions'],
            aliasKeys: ['nodes.kind.subscription']
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
