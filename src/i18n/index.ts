import {createContext, useContext, useMemo} from 'react';
import {table, type Key} from './messages';

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
const plurals = new Map<Lang, Intl.PluralRules>();
// An integer parameter is written with the language's grouping, so a count reads as 1,000 rather than 1000;
// a measurement with decimals is already formatted by its caller.
const param = (lang: Lang, value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? formatNumber(value, LOCALE[lang]) : String(value));
export function translate(lang: Lang, key: Key, params?: Params): string {
  const message = table[lang][key];
  let text: string;
  if (typeof message === 'string') text = message;
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
export function formatNumber(value: number, locale: string, digits = 0): string {
  const key = locale + '/' + digits;
  let formatter = numbers.get(key);
  if (!formatter) numbers.set(key, (formatter = new Intl.NumberFormat(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits})));
  return formatter.format(value);
}
