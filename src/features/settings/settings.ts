import {readLang, type Lang} from '../../i18n';
import {readProfiles, type Profile, type StoragePort} from '../../api/profiles';
export type Scheme = 'system' | 'light' | 'dark';
export type Wordmark = 'gradient' | 'plain';
export type PaletteId =
  | 'rose-pine/main'
  | 'rose-pine/moon'
  | 'catppuccin/frappe'
  | 'catppuccin/macchiato'
  | 'catppuccin/mocha'
  | 'nord/nord'
  | 'kary/kary'
  | 'glass/glass'
  | 'antd/antd'
  | 'arco/arco'
  | 'semi/semi';

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

const keys = {
  lang: 'doona-lang',
  scheme: 'doona-scheme',
  palette: 'doona-palette',
  wordmark: 'doona-wordmark'
} as const;

// A storage that throws (private mode, quota) costs the persistence, not the change.
export function writeSetting(key: keyof typeof keys, value: string, storage?: StoragePort) {
  try {
    (storage ?? localStorage).setItem(keys[key], value);
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
  const scheme = read(keys.scheme);
  const palette = read(keys.palette);
  const profiles = readProfiles(storage);
  const active = profiles.profiles.find(profile => profile.id === profiles.activeId);
  return {
    ...profiles,
    api: active?.api ?? null,
    token: active?.token ?? '',
    lang: readLang(storage),
    scheme: scheme === 'light' || scheme === 'dark' ? scheme : 'system',
    palette: palette?.includes('/') ? (palette as PaletteId) : 'rose-pine/moon',
    wordmark: read(keys.wordmark) === 'plain' ? 'plain' : 'gradient'
  };
}

export function shouldOpenSettings(api: string | null, hash: string): boolean {
  return api === null && (hash === '' || hash === '#' || hash === '#/');
}
