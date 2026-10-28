import {createContext, useContext, useMemo} from 'react';
import type en from './locales/en.json';
import {storageKeys} from '../api/storage';
import {loadFaces} from '../fonts';
import {browserLang, DEFAULT_LANG, isLang, languages, REFERENCE_LANG, type Lang} from './languages';
import {stages, type Stage} from './stages';
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
export {pageDirection} from './direction';

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
// A catalogue loads in stages (tools/catalogue-parts.mjs): the core part at startup, the later ones with the code that
// first shows their keys, which wraps its dynamic import in withCatalogue. A build splits each catalogue by stage; the
// dev server serves it whole as the core part.
// Built on first read: Node runs this module in the e2e specs, without import.meta.glob, and passes its own reader.
let parts: Record<Stage, Record<string, () => Promise<Partial<Catalogue>>>> | undefined;
const partLoaders = () =>
  (parts ??= {
    core: import.meta.glob<Partial<Catalogue>>('./locales/*.json', {query: {part: 'core'}, import: 'default'}),
    activity: import.meta.glob<Partial<Catalogue>>('./locales/*.json', {query: {part: 'activity'}, import: 'default'}),
    rest: import.meta.glob<Partial<Catalogue>>('./locales/*.json', {query: {part: 'rest'}, import: 'default'})
  });
// Each part is its own chunk, loaded on first use; translate reads only what has loaded. Give its optional glyphs
// a short head start, then publish even if the font host stalls so the page can render with the system fallback.
type Reader = (lang: Lang, stage: Stage) => Promise<Partial<Catalogue>>;
const FONT_WAIT_MS = 3000;
function readCatalogue(lang: Lang, stage: Stage): Promise<Partial<Catalogue>> {
  const part = partLoaders()[stage][`./locales/${lang}.json`]();
  const {fonts, faces} = languages.find(language => language.id === lang)!;
  return part.then(messages => {
    const text = Object.values(messages)
      .flatMap(message => (typeof message === 'string' ? message : Object.values(message)))
      .join('');
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<void>(resolve => {
      timer = setTimeout(resolve, FONT_WAIT_MS);
    });
    return Promise.race([loadFaces(fonts, faces[0], text), deadline])
      .then(() => messages)
      .finally(() => clearTimeout(timer));
  });
}
const catalogues = new Map<Lang, Partial<Catalogue>>();
const loaded = new Set<Lang>();
const loading = new Map<Lang, {stage: number; promise: Promise<void>}>();
const readers = new Map<Lang, Reader>();
const partLoads = new Map<string, Promise<void>>();
// The latest stage any code has asked for; a language loaded later loads every part up to it.
let reached = 0;
function loadPart(lang: Lang, stage: Stage, read: Reader): Promise<void> {
  const id = `${lang}/${stage}`;
  let pending = partLoads.get(id);
  if (!pending) {
    pending = read(lang, stage).then(
      messages => void catalogues.set(lang, {...catalogues.get(lang), ...messages}),
      (error: unknown) => {
        // A failed chunk (offline, a new deploy) can be asked for again.
        partLoads.delete(id);
        throw error;
      }
    );
    partLoads.set(id, pending);
  }
  return pending;
}
// Node imports JSON only with the type attribute, which Vite 6 does not expand, so the e2e specs pass their own reader.
// A partial language loads the reference catalogue too; translation resolves its missing keys from English.
export function loadLanguage(lang: Lang, read: Reader = readCatalogue): Promise<void> {
  const current = loading.get(lang);
  // A new stage or a failed part needs a fresh wait, including parts already in flight.
  if (!current || current.stage < reached || stages.slice(0, reached + 1).some(stage => !partLoads.has(`${lang}/${stage}`))) {
    readers.set(lang, read);
    const {complete} = languages.find(language => language.id === lang)!;
    const own = Promise.all(stages.slice(0, reached + 1).map(stage => loadPart(lang, stage, read)));
    const table = complete ? own : Promise.all([own, loadLanguage(REFERENCE_LANG, read)]);
    const pending = table.then(
      () => void loaded.add(lang),
      (error: unknown) => {
        loading.delete(lang);
        throw error;
      }
    );
    loading.set(lang, {stage: reached, promise: pending});
    return pending;
  }
  return current.promise;
}
// The parts up to `stage` of every language this page loads, now and later. Only the shown language's parts, with
// English for a partial language, can fail the stage; another language's failed part loads again with that language.
export function loadStage(stage: Stage): Promise<void> {
  const index = stages.indexOf(stage);
  reached = Math.max(reached, index);
  const shown = loadedLang(readLang());
  const needed = languages.find(language => language.id === shown)!.complete ? [shown] : [shown, REFERENCE_LANG];
  const wanted = [...loading.keys()].map(lang => {
    const parts = Promise.all(stages.slice(0, index + 1).map(part => loadPart(lang, part, readers.get(lang)!)));
    return needed.includes(lang) ? parts : parts.catch(() => undefined);
  });
  return Promise.all(wanted).then(() => undefined);
}
// A dynamic import that resolves once the module and its stage's messages have arrived, so what it renders never shows
// a key. tools/catalogue-parts.mjs reads the stage from this call, so it is always written around the import itself.
export function withCatalogue<T>(stage: Stage, load: () => Promise<T>): () => Promise<T> {
  return () => Promise.all([load(), loadStage(stage)]).then(([module]) => module);
}
export function isLoaded(lang: Lang) {
  return loaded.has(lang);
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
