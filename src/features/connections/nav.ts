import type {Key} from '../../i18n';

export type ConnectionTab = 'list' | 'traffic';
// The traffic chart is the first tab; a link with a filter or selection opens the list (useConnectionsPage).
export function connectionsTabs(): Array<{id: ConnectionTab; titleKey: Key}> {
  return [
    {id: 'traffic', titleKey: 'conn.tab.traffic'},
    {id: 'list', titleKey: 'conn.tab.list'}
  ];
}
