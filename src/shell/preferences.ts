import {createContext} from 'react';
import {readLang, type Lang} from '../i18n';
import {readProfiles, type Profile, type StoragePort} from '../api/profiles';
import {storageKeys} from '../api/storage';
import {DEFAULT_PALETTE, isPaletteId, type PaletteId} from './palettes';
export type Scheme = 'system' | 'light' | 'dark';
export type Wordmark = 'gradient' | 'plain';
export type {PaletteId};

export type Settings = {
  api: string | null;
  token: string;
  profiles: Profile[];
  activeId: string;
  lang: Lang;
  scheme: Scheme;
  palette: PaletteId;
  wordmark: Wordmark;
};

// A storage that throws (private mode, quota) costs the persistence, not the change.
export function writeSetting(key: 'lang' | 'scheme' | 'palette' | 'wordmark', value: string, storage?: StoragePort) {
  try {
    (storage ?? localStorage).setItem(storageKeys[key], value);
  } catch {}
}

export function readSettings(storage?: StoragePort): Settings {
  const read = (key: string): string | null => {
    try {
      return (storage ?? localStorage).getItem(key);
    } catch {
      return null;
    }
  };
  const scheme = read(storageKeys.scheme);
  const palette = read(storageKeys.palette);
  const profiles = readProfiles(storage);
  const active = profiles.profiles.find(profile => profile.id === profiles.activeId);
  return {
    ...profiles,
    api: active?.api ?? null,
    token: active?.token ?? '',
    lang: readLang(storage),
    scheme: scheme === 'light' || scheme === 'dark' ? scheme : 'system',
    palette: isPaletteId(palette) ? palette : DEFAULT_PALETTE,
    wordmark: read(storageKeys.wordmark) === 'plain' ? 'plain' : 'gradient'
  };
}

export function shouldOpenSettings(api: string | null, hash: string): boolean {
  return api === null && (hash === '' || hash === '#' || hash === '#/');
}

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
