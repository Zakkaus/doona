import type {Capabilities, ConfigSource} from '../../api/model';
import type {Key} from '../../i18n';

// Quick setup needs a writable main source with its text; a redacted text is shown but cannot be written back.
export function setupAvailable(resources: Capabilities['resources'] | undefined, main: ConfigSource | null | undefined): boolean {
  return !!main && resources?.config.writable === true && main.writable && main.content !== undefined;
}
export function configTabs(setup: boolean): Array<{id: 'modules' | 'setup' | 'source' | 'validate'; titleKey: Key}> {
  return [
    {id: 'modules', titleKey: 'config.tabModules'},
    ...(setup ? [{id: 'setup' as const, titleKey: 'config.wizard' as const}] : []),
    {id: 'source', titleKey: 'config.tabSource'},
    {id: 'validate', titleKey: 'config.tabValidate'}
  ];
}
export const sourceKinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
