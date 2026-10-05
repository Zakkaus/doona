import {createContext} from 'react';
import {readLang, type Lang} from '../i18n';
import {readProfiles, type Profile, type StoragePort} from '../api/profiles';
import {FLAG_OVERRIDE_LIMIT, flagKey, validFlagChoice, validFlagName, type FlagOverrides} from '../dae/flags';
import {storageKeys} from '../api/storage';
import {readDateFormat, readTimeFormat, type DateFormat, type TimeFormat} from '../i18n/format';
import {DEFAULT_PALETTE, isPaletteId, type PaletteId} from './palettes';
import type {ToastPlacement} from '../ui/ui';
import type {PaletteSection} from './view';
import {defaultRoute, hasRoute, isRoutePath, type RoutePath} from './routes';
export type Scheme = 'system' | 'light' | 'dark';
export type Wordmark = 'gradient' | 'plain';
export type {DateFormat, PaletteId, TimeFormat, ToastPlacement};
const TOAST_PLACEMENTS: ToastPlacement[] = ['top', 'top end', 'bottom', 'bottom end'];
// The Glass palettes' blur strength: a multiplier of each material's own radii, from none to half as much again.
export const DEFAULT_BLUR = 1;
export const MAX_BLUR = 1.5;
export function readBlur(value: string | null): number {
  const scale = value === null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(scale) ? Math.min(MAX_BLUR, Math.max(0, scale)) : DEFAULT_BLUR;
}

export type Settings = {
  api: string | null;
  token: string;
  profiles: Profile[];
  activeId: string;
  lang: Lang;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  scheme: Scheme;
  palette: PaletteId;
  blur: number;
  wordmark: Wordmark;
  mirrored: boolean;
  countryFlags: boolean;
  sparklines: boolean;
  flagOverrides: FlagOverrides;
  toastPlacement: ToastPlacement;
  startPage: RoutePath;
};

// A storage that throws (private mode, quota) costs the persistence, not the change.
export function writeSetting(
  key:
    | 'lang'
    | 'dateFormat'
    | 'timeFormat'
    | 'scheme'
    | 'palette'
    | 'blur'
    | 'wordmark'
    | 'mirror'
    | 'countryFlags'
    | 'sparklines'
    | 'flagOverrides'
    | 'toastPlacement'
    | 'startPage',
  value: string,
  storage?: StoragePort
) {
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
  const placement = read(storageKeys.toastPlacement);
  const startPage = read(storageKeys.startPage);
  const profiles = readProfiles(storage);
  const active = profiles.profiles.find(profile => profile.id === profiles.activeId);
  return {
    ...profiles,
    api: active?.api ?? null,
    token: active?.token ?? '',
    lang: readLang(storage),
    dateFormat: readDateFormat(storage),
    timeFormat: readTimeFormat(storage),
    scheme: scheme === 'light' || scheme === 'dark' ? scheme : 'system',
    palette: isPaletteId(palette) ? palette : DEFAULT_PALETTE,
    blur: readBlur(read(storageKeys.blur)),
    wordmark: read(storageKeys.wordmark) === 'plain' ? 'plain' : 'gradient',
    mirrored: read(storageKeys.mirror) === 'on',
    startPage: startPage !== null && isRoutePath(startPage) ? startPage : defaultRoute,
    countryFlags: read(storageKeys.countryFlags) !== 'off',
    sparklines: read(storageKeys.sparklines) !== 'off',
    flagOverrides: readFlagOverrides(storage),
    toastPlacement: TOAST_PLACEMENTS.find(item => item === placement) ?? 'bottom'
  };
}

export function shouldOpenSettings(api: string | null, hash: string): boolean {
  return api === null && !hasRoute(hash);
}

type Appearance = {
  scheme: Scheme;
  dark: boolean;
  toggle: () => void;
  pickScheme: (value: Scheme) => void;
  palette: PaletteId;
  pickPalette: (value: PaletteId) => void;
  blur: number;
  pickBlur: (value: number) => void;
  wordmark: Wordmark;
  pickWordmark: (value: Wordmark) => void;
  mirrored: boolean;
  countryFlags: boolean;
  flagOverrides: FlagOverrides;
  pickMirrored: (value: boolean) => void;
  pickCountryFlags: (value: boolean) => void;
  sparklines: boolean;
  pickSparklines: (value: boolean) => void;
  pickFlag: (name: string, value: string) => void;
  toastPlacement: ToastPlacement;
  pickToastPlacement: (value: ToastPlacement) => void;
  startPage: RoutePath;
  pickStartPage: (value: RoutePath) => void;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  pickDateFormat: (value: DateFormat) => void;
  pickTimeFormat: (value: TimeFormat) => void;
};
export const SettingsContext = createContext<{
  lang: Lang;
  pickLang: (value: Lang) => void;
  ap: Appearance;
  paletteSections: PaletteSection[];
  startPageItems: Array<{id: RoutePath; label: string}>;
} | null>(null);

export function readFlagOverrides(storage?: StoragePort): FlagOverrides {
  try {
    const value: unknown = JSON.parse((storage ?? localStorage).getItem(storageKeys.flagOverrides) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, choice]) => key.startsWith('node:') && validFlagName(key.slice(5)) && validFlagChoice(choice))
        .slice(-FLAG_OVERRIDE_LIMIT)
    );
  } catch {
    return {};
  }
}

export function updateFlagOverride(overrides: FlagOverrides, name: string, value: string): FlagOverrides {
  if (!validFlagName(name) || (value !== 'automatic' && !validFlagChoice(value))) return overrides;
  const key = flagKey(name);
  const entries = Object.entries(overrides).filter(([id]) => id !== key);
  if (value !== 'automatic') entries.push([key, value]);
  return Object.fromEntries(entries.slice(-FLAG_OVERRIDE_LIMIT));
}
