import {flagRegions, regionFlag, regions} from './regions';

export {flagRegions, regionFlag};
export type FlagOverrides = Record<string, string>;
export const FLAG_OVERRIDE_LIMIT = 512;
export const flagKey = (name: string) => `node:${name}`;
export const validFlagName = (name: string) => name.length > 0 && name.length <= 512;
export const hasEmbeddedFlag = (name: string) => /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}/u.test(name);
export const validFlagChoice = (value: unknown): value is string => typeof value === 'string' && (value === 'none' || flagRegions.includes(value));

type FlagChoice = {id: string; label: string; flag: string; keywords: string};
// Every policy card and group dialog asks for the same list, and building it walks every region through Intl, so it is
// built once per locale.
const choicesByLocale = new Map<string, FlagChoice[]>();
export function flagChoices(locale: string): FlagChoice[] {
  let choices = choicesByLocale.get(locale);
  if (!choices) choicesByLocale.set(locale, (choices = buildFlagChoices(locale)));
  return choices;
}
function buildFlagChoices(locale: string): FlagChoice[] {
  const names = new Intl.DisplayNames([locale], {type: 'region'});
  const language = new Intl.Locale(locale).language;
  const english = new Intl.DisplayNames(['en'], {type: 'region'});
  const collator = new Intl.Collator(locale);
  const known = new Map(regions.map(([id, aliases, names], rank) => [id, {aliases, names, rank}]));
  return flagRegions
    .map(id => {
      const region = known.get(id);
      const official = names.of(id) ?? id;
      return {
        id,
        label: region?.names?.short[locale] ?? region?.names?.short[language] ?? official,
        flag: regionFlag(id),
        keywords: [id, official, english.of(id), ...(region?.names?.official ?? []), ...(region?.aliases ?? [])].join(' ')
      };
    })
    .sort((a, b) => (known.get(a.id)?.rank ?? regions.length) - (known.get(b.id)?.rank ?? regions.length) || collator.compare(a.label, b.label));
}
