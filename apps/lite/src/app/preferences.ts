import {createContext, useContext} from 'react';
import type {Locale} from '../i18n';
export type Mode = 'light' | 'dark' | 'system';
export const PreferencesContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
}>(null!);
export const usePreferences = () => useContext(PreferencesContext);
