import type {ConfigSource} from '../../api/model';
import type {Key} from '../../i18n';

// The global tab edits the engine's global section, so it shows only for an engine whose settings doona knows.
export function configTabs(hasGlobal: boolean): Array<{id: 'modules' | 'global' | 'source'; titleKey: Key}> {
  return [
    {id: 'modules' as const, titleKey: 'config.tabModules' as const},
    ...(hasGlobal ? [{id: 'global' as const, titleKey: 'config.tabGlobal' as const}] : []),
    {id: 'source' as const, titleKey: 'config.tabSource' as const}
  ];
}
export const sourceKinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
