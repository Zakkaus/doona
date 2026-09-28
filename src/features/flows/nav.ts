import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';

export type FlowTab = 'map' | 'records';
// The map of where traffic goes comes first and is the default, then the records it is drawn from.
export function flowsTabs(resources: Capabilities['resources'] | undefined): Array<{id: FlowTab; titleKey: Key}> {
  if (!offered(resources, 'flows', {whileLoading: true})) return [];
  return [
    {id: 'map', titleKey: 'flow.tab.map'},
    {id: 'records', titleKey: 'flow.tab.records'}
  ];
}
