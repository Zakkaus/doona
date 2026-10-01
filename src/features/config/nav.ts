import type {ConfigSource} from '../../api/model';
import type {Key} from '../../i18n';

export function configTabs(): Array<{id: 'modules' | 'source'; titleKey: Key}> {
  return [
    {id: 'modules', titleKey: 'config.tabModules'},
    {id: 'source', titleKey: 'config.tabSource'}
  ];
}
export const sourceKinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
