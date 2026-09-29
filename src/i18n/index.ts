import {createContext, useContext, useMemo} from 'react';
import type en from './locales/en.json';
import {storageKeys} from '../api/storage';
import {browserLang, DEFAULT_LANG, isLang, languages, REFERENCE_LANG, type Lang} from './languages';
// English is the reference: every catalogue's keys are among its keys.
export type Key = keyof typeof en;
export {browserLang, DEFAULT_LANG, languages, REFERENCE_LANG, type Lang};

type PluralCategory = Intl.LDMLPluralRule;
export type Message = string | ({other: string} & Partial<Record<Exclude<PluralCategory, 'other'>, string>>);
export type Params = Record<string, string | number | bigint>;
// Decimals to write for named number parameters, such as {n: 1} for a percent with one decimal.
export type Precision = Readonly<Record<string, number>>;
// A plural message selects on `n` unless the caller names another numeric parameter.
export type Translator = (key: Key, params?: Params, pluralParam?: string, precision?: Precision) => string;
export const LANGS: Array<[Lang, string]> = languages.map(language => [language.id, language.name]);
export const LOCALE = Object.fromEntries(languages.map(language => [language.id, language.locale])) as Record<Lang, string>;
// The body's font stack: the language's faces, then the system font.
export const FONT = Object.fromEntries(
  languages.map(language => [language.id, [...language.faces.map(face => `'${face}'`), 'system-ui', 'sans-serif'].join(', ')])
) as Record<Lang, string>;
export {pageDirection, textDirection, type Dir} from './direction';

export const LangContext = createContext<Lang>(DEFAULT_LANG);
export function useLang() {
  return useContext(LangContext);
}
export function readLang(storage?: Pick<Storage, 'getItem'>, tags?: readonly string[]): Lang {
  let value: string | null = null;
  try {
    value = (storage ?? localStorage).getItem(storageKeys.lang);
  } catch {
    // Storage blocked: fall through to the browser.
  }
  if (isLang(value)) return value;
  return browserLang(tags ?? (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]));
}
export type Catalogue = Record<Key, Message>;
// Each language is its own chunk, loaded on first use; `translate` reads only what has loaded. Vite expands the
// template import into one chunk per catalogue. A language with ideograph faces brings their stylesheet, so they are
// declared before the page renders in it; a face stylesheet that fails to load leaves the text to the system font.
function readCatalogue(lang: Lang): Promise<Partial<Catalogue>> {
  const {fonts} = languages.find(language => language.id === lang)!;
  const catalogue = (import(`./locales/${lang}.json`) as Promise<{default: Partial<Catalogue>}>).then(module => module.default);
  return fonts ? Promise.all([catalogue, import(`../fonts-${fonts}.css`).catch(() => undefined)]).then(([messages]) => messages) : catalogue;
}
const catalogues = new Map<Lang, Partial<Catalogue>>();
const loading = new Map<Lang, Promise<void>>();
// Node imports JSON only with the type attribute, which Vite 6 does not expand, so the e2e specs pass their own reader.
// A partial language loads the reference catalogue too; translation resolves its missing keys from English.
export function loadLanguage(lang: Lang, read: (lang: Lang) => Promise<Partial<Catalogue>> = readCatalogue): Promise<void> {
  let pending = loading.get(lang);
  if (!pending) {
    const {complete} = languages.find(language => language.id === lang)!;
    const table = complete ? read(lang) : Promise.all([read(lang), loadLanguage(REFERENCE_LANG, read)]).then(([own]) => own);
    pending = table.then(
      messages => void catalogues.set(lang, messages),
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
const unsigned = /^(0|[1-9][0-9]*)$/;
// An integer parameter is written with the language's grouping, so a count reads as 1,000 rather than 1000; a UInt64
// count, a bigint or the API's decimal string, is written exactly. A decimal takes the precision its caller names in
// `precision`, else Intl's default of up to three decimals.
const decimals = new Map<Lang, Intl.NumberFormat>();
const param = (lang: Lang, value: unknown, count: boolean, digits?: number) => {
  if (typeof value === 'bigint' || (count && typeof value === 'string' && unsigned.test(value))) return formatNumber(BigInt(value), LOCALE[lang]);
  if (typeof value !== 'number') return String(value);
  if (digits !== undefined || Number.isInteger(value)) return formatNumber(value, LOCALE[lang], digits);
  let formatter = decimals.get(lang);
  if (!formatter) decimals.set(lang, (formatter = new Intl.NumberFormat(LOCALE[lang])));
  return formatter.format(value);
};
// Above Number.MAX_SAFE_INTEGER a count selects with its low six digits plus a million, which keeps every CLDR integer
// rule (they test at most the last six digits) and never reads a large count as zero or one. Formatted text selects `other`.
const pluralNumber = (value: string | number | bigint): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && !unsigned.test(value)) return NaN;
  const integer = BigInt(value);
  return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : Number(integer % 1_000_000n) + 1_000_000;
};
export function translate(lang: Lang, key: Key, params?: Params, pluralParam = 'n', precision?: Precision): string {
  const own = catalogues.get(lang)?.[key];
  const message = own ?? catalogues.get(REFERENCE_LANG)?.[key];
  const origin = own === undefined ? REFERENCE_LANG : lang;
  let text: string;
  if (message === undefined) text = key;
  else if (typeof message === 'string') text = message;
  else {
    let rules = plurals.get(origin);
    if (!rules) plurals.set(origin, (rules = new Intl.PluralRules(LOCALE[origin])));
    const operand = params?.[pluralParam];
    const category = rules.select(operand === undefined ? NaN : pluralNumber(operand));
    text = message[category] ?? message.other;
  }
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => param(lang, params[name], name === pluralParam, precision?.[name])) : text;
}
// Keys to read in place of others, such as the palette's own words for a few statuses (src/shell/palettes.ts).
export type Rewording = Readonly<Partial<Record<Key, Key>>>;
export const RewordingContext = createContext<Rewording | undefined>(undefined);
// One translator per language and rewording, so effects and memos that list `t` do not re-run every render.
export function useT(): Translator {
  const lang = useLang();
  const rewording = useContext(RewordingContext);
  return useMemo(
    () => (key: Key, params?: Params, pluralParam?: string, precision?: Precision) => translate(lang, rewording?.[key] ?? key, params, pluralParam, precision),
    [lang, rewording]
  );
}

// A plain enumeration for cells and captions, without a conjunction.
export function formatList(lang: Lang, values: string[]): string {
  return values.join(translate(lang, 'ui.listSeparator'));
}

const numbers = new Map<string, Intl.NumberFormat>();
export function formatNumber(value: number | bigint, locale: string, digits = 0): string {
  const key = locale + '/' + digits;
  let formatter = numbers.get(key);
  if (!formatter) numbers.set(key, (formatter = new Intl.NumberFormat(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits})));
  return formatter.format(value);
}
