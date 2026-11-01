import type {Key} from '../../i18n';

type ConfigTab = {id: 'modules' | 'global' | 'source' | 'history'; titleKey: Key; aliases?: readonly string[]};
// Every tab of the page in order, which configTabs narrows to those the backend offers and the Skeleton draws whole
// until the version and capabilities say which. `aliases` are other words search finds a tab by.
export const allConfigTabs: readonly ConfigTab[] = [
  {id: 'modules', titleKey: 'config.tabModules'},
  {id: 'global', titleKey: 'config.tabGlobal'},
  {id: 'source', titleKey: 'config.tabSource'},
  {id: 'history', titleKey: 'config.tabHistory', aliases: ['history', 'revision', 'backup']}
];
