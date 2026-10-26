import {createContext, useContext} from 'react';
import {en, type Messages} from './en';
import {zhCN} from './zh-CN';
import {zhTW} from './zh-TW';

export type Locale = 'en' | 'zh-CN' | 'zh-TW';
export type MessageKey = keyof Messages;
export const catalogs: Record<Locale, Messages> = {en, 'zh-CN': zhCN, 'zh-TW': zhTW};
// Each language is named in its own script, whatever the interface language.
export const localeNames: Record<Locale, string> = {en: 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文'};
export const LocaleContext = createContext<Locale>('en');
export const useMessages = () => catalogs[useContext(LocaleContext)];
