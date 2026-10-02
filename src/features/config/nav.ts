import {configManagement} from '../../api/engines';
import type {Capabilities, ConfigSource} from '../../api/model';
import type {Key} from '../../i18n';

// The global tab edits the engine's global section, so it shows only for an engine whose settings doona knows.
export function configTabs(hasGlobal: boolean, capabilities?: Capabilities): Array<{id: 'modules' | 'global' | 'source' | 'history'; titleKey: Key}> {
  const management = configManagement(capabilities);
  return [
    {id: 'modules' as const, titleKey: 'config.tabModules' as const},
    ...(hasGlobal ? [{id: 'global' as const, titleKey: 'config.tabGlobal' as const}] : []),
    {id: 'source' as const, titleKey: 'config.tabSource' as const},
    ...(management.export || management.import || management.revisions ? [{id: 'history' as const, titleKey: 'config.tabHistory' as const}] : [])
  ];
}
export const sourceKinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
