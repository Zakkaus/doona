import {createContext, useContext, useMemo} from 'react';
import type {Key} from './locales/zh-TW';
export type {Key};

export type Lang = 'zh-TW' | 'zh-CN' | 'en';
export type Message = string | {one: string; other: string};
export type Params = Record<string, string | number>;
export type Translator = (key: Key, params?: Params) => string;
export const LANGS: Array<[Lang, string]> = [
  ['zh-TW', '繁體中文'],
  ['zh-CN', '简体中文'],
  ['en', 'English']
];
export const LOCALE: Record<Lang, string> = {'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en-US'};

export const LangContext = createContext<Lang>('zh-TW');
export function useLang() {
  return useContext(LangContext);
}
export function readLang(storage?: Pick<Storage, 'getItem'>): Lang {
  try {
    const value = (storage ?? localStorage).getItem('doona-lang');
    return value === 'zh-CN' || value === 'en' ? value : 'zh-TW';
  } catch {
    return 'zh-TW';
  }
}
// Each language is its own chunk, loaded on first use; `translate` reads only what has loaded.
const loaders: Record<Lang, () => Promise<{messages: Record<Key, Message>}>> = {
  // Each Chinese catalogue brings its ideograph faces, so they are declared before the page renders in it; a face
  // stylesheet that fails to load leaves the text to the system font.
  'zh-TW': () => Promise.all([import('./locales/zh-TW'), import('../fonts-tc.css').catch(() => undefined)]).then(([module]) => module),
  'zh-CN': () => Promise.all([import('./locales/zh-CN'), import('../fonts-sc.css').catch(() => undefined)]).then(([module]) => module),
  en: () => import('./locales/en')
};
const catalogues = new Map<Lang, Record<Key, Message>>();
const loading = new Map<Lang, Promise<void>>();
export function loadLanguage(lang: Lang): Promise<void> {
  let pending = loading.get(lang);
  if (!pending) {
    pending = loaders[lang]().then(
      module => void catalogues.set(lang, module.messages),
      (error: unknown) => {
        // A failed chunk (offline, a new deploy) can be asked for again.
        loading.delete(lang);
        throw error;
      }
    );
    loading.set(lang, pending);
  }
  return pending;
}
export function isLoaded(lang: Lang) {
  return catalogues.has(lang);
}
// The preferred language when this page has loaded it, otherwise one it has; another tab may have saved a
// language this page never loaded.
export const loadedLang = (preferred: Lang): Lang => [preferred, ...LANGS.map(([lang]) => lang)].find(isLoaded) ?? preferred;
const plurals = new Map<Lang, Intl.PluralRules>();
// An integer parameter is written with the language's grouping, so a count reads as 1,000 rather than 1000;
// a measurement with decimals is already formatted by its caller.
const param = (lang: Lang, value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? formatNumber(value, LOCALE[lang]) : String(value));
export function translate(lang: Lang, key: Key, params?: Params): string {
  const message = catalogues.get(lang)?.[key];
  let text: string;
  if (message === undefined) text = key;
  else if (typeof message === 'string') text = message;
  else {
    let rules = plurals.get(lang);
    if (!rules) plurals.set(lang, (rules = new Intl.PluralRules(LOCALE[lang])));
    text = message[rules.select(Number(params?.n)) === 'one' ? 'one' : 'other'];
  }
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => param(lang, params[name])) : text;
}
// One translator per language, so effects and memos that list `t` do not re-run every render.
export function useT(): Translator {
  const lang = useLang();
  return useMemo(() => (key: Key, params?: Params) => translate(lang, key, params), [lang]);
}

const lists = new Map<Lang, Intl.ListFormat>();
// A plain enumeration for cells and captions: Chinese uses the enumeration comma, English a comma with no "and".
export function formatList(lang: Lang, values: string[]): string {
  if (lang.startsWith('zh')) return values.join('、');
  let formatter = lists.get(lang);
  if (!formatter) lists.set(lang, (formatter = new Intl.ListFormat(LOCALE[lang], {style: 'narrow', type: 'conjunction'})));
  return formatter.format(values);
}

const numbers = new Map<string, Intl.NumberFormat>();
export function formatNumber(value: number | bigint, locale: string, digits = 0): string {
  const key = locale + '/' + digits;
  let formatter = numbers.get(key);
  if (!formatter) numbers.set(key, (formatter = new Intl.NumberFormat(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits})));
  return formatter.format(value);
}
