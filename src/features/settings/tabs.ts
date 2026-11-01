import type {Key} from '../../i18n';

// The page's tabs and their titles.
export const settingsTabs = ['general', 'appearance'] as const;
export type SettingsTab = (typeof settingsTabs)[number];
export const settingsTabTitle = {general: 'settings.general', appearance: 'settings.appearance'} as const satisfies Record<SettingsTab, Key>;
