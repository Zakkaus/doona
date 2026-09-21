import {createContext} from 'react';
import type {Lang} from '../../i18n';
import type {PaletteId, Scheme, Wordmark} from './settings';

type Appearance = {
  scheme: Scheme;
  dark: boolean;
  toggle: () => void;
  pickScheme: (value: Scheme) => void;
  palette: PaletteId;
  pickPalette: (value: PaletteId) => void;
  wordmark: Wordmark;
  pickWordmark: (value: Wordmark) => void;
};
export const SettingsContext = createContext<{
  lang: Lang;
  pickLang: (value: Lang) => void;
  ap: Appearance;
  paletteSections: Array<{title: string; items: Array<{id: PaletteId; label: string; desc?: string}>}>;
} | null>(null);
