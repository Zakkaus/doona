import type {Key} from '../../i18n';

export type ConnectionTab = 'list' | 'traffic';
export function connectionsTabs(): Array<{id: ConnectionTab; titleKey: Key}> {
  return [
    {id: 'traffic', titleKey: 'act.traffic'},
    {id: 'list', titleKey: 'conn.tab.list'}
  ];
}
