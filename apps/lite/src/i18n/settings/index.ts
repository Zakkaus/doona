import type {Locale} from '..';
import {en, type SettingsMessages} from './en';
import {zhCN} from './zh-CN';
import {zhTW} from './zh-TW';

// Load backend guidance with SettingsDialog, not the application shell.
export const settingsCatalogs: Record<Locale, SettingsMessages> = {en, 'zh-CN': zhCN, 'zh-TW': zhTW};
