import {regions} from './regions';

export const flagRegions =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' '
  );
export type FlagOverrides = Record<string, string>;
export const FLAG_OVERRIDE_LIMIT = 512;
export const flagKey = (name: string) => `node:${name}`;
export const validFlagName = (name: string) => name.length > 0 && name.length <= 512;
export const hasEmbeddedFlag = (name: string) => /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}/u.test(name);
export const validFlagChoice = (value: unknown): value is string => typeof value === 'string' && (value === 'none' || flagRegions.includes(value));
export const regionFlag = (region: string) => String.fromCodePoint(...[...region].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65));

export function flagChoices(locale: string) {
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
