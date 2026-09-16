export type Scheme = 'system' | 'light' | 'dark';
export type Wordmark = 'gradient' | 'plain';
export type PaletteId =
  | 'rose-pine/main'
  | 'rose-pine/moon'
  | 'catppuccin/frappe'
  | 'catppuccin/macchiato'
  | 'catppuccin/mocha'
  | 'nord/nord'
  | 'glass/glass'
  | 'antd/antd'
  | 'arco/arco'
  | 'semi/semi';

export type Settings = {
  api: string | null;
  token: string;
  lang: 'zh-TW' | 'zh-CN' | 'en';
  scheme: Scheme;
  palette: PaletteId;
  wordmark: Wordmark;
};

const keys = {
  api: 'doona-api',
  token: 'doona-api-token',
  lang: 'doona-lang',
  scheme: 'doona-scheme',
  palette: 'doona-palette',
  wordmark: 'doona-wordmark'
} as const;

/** Accept a server root or proxy prefix, never credentials, a query, or a fragment. */
export function normalizeApi(value: string): string {
  const base = value.trim();
  if (!base || base === 'mock') return base;
  if (!/^https?:\/\/[^/]+/i.test(base) || /[\s\\?#]/.test(base)) throw new Error('invalid_url');
  const url = new URL(base);
  if (!url.hostname || url.username || url.password) throw new Error('invalid_url');
  return base.replace(/\/+$/, '');
}

export function readSettings(storage?: Pick<Storage, 'getItem'>): Settings {
  const read = (key: string): string | null => {
    try {
      return (storage ?? localStorage).getItem(key);
    } catch {
      return null;
    }
  };
  const lang = read(keys.lang);
  const scheme = read(keys.scheme);
  const palette = read(keys.palette);
  return {
    api: read(keys.api),
    token: read(keys.token) ?? '',
    lang: lang === 'zh-CN' || lang === 'en' ? lang : 'zh-TW',
    scheme: scheme === 'light' || scheme === 'dark' ? scheme : 'system',
    palette: palette?.includes('/') ? (palette as PaletteId) : 'rose-pine/moon',
    wordmark: read(keys.wordmark) === 'plain' ? 'plain' : 'gradient'
  };
}

export function writeSettings(patch: Partial<Omit<Settings, 'api'>> & {api?: string}, storage: Pick<Storage, 'setItem'> = localStorage): void {
  // Validate before writing any field so a rejected URL cannot partially change the backend.
  const values = patch.api === undefined ? patch : {...patch, api: normalizeApi(patch.api)};
  for (const key of Object.keys(values) as Array<keyof Settings>) {
    const value = values[key];
    if (value !== undefined) storage.setItem(keys[key], value);
  }
}

export function shouldOpenSettings(api: string | null, hash: string): boolean {
  return api === null && (hash === '' || hash === '#' || hash === '#/');
}
