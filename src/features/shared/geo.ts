import {regions} from '../../dae/regions';
import {MAX_PAGE} from '../../store/cadence';
import {boundedMemo} from './boundedMemo';

// Aliases in priority order. ISO codes that are also common words only match in capitals.
const aliases = regions.flatMap(([iso, keys]) =>
  [...new Set([iso, ...keys].map(key => (key.toUpperCase() === iso ? iso : key)))].map(key => ({
    iso,
    key,
    exactCase: key.toUpperCase() === iso && ['IN', 'IT', 'MY', 'NO', 'ID'].includes(iso)
  }))
);
// One alternation per case rule. A regex takes the leftmost position where any alternative matches and, there,
// the first alternative that matches. Each alias matches exactly its own length (the case-insensitive folds of
// these keys are single code units), so sorting longest first, then by priority, picks the alias the old
// one-regex-per-alias loop picked. Han aliases never share a first character with Latin ones, so the two groups
// cannot both match at one position; only Latin aliases need whole-word bounds.
const matchers = [false, true].map(exactCase => {
  const members = aliases
    .map((alias, rank) => ({...alias, rank}))
    .filter(alias => alias.exactCase === exactCase)
    .sort((a, b) => b.key.length - a.key.length || a.rank - b.rank);
  const han = members.filter(({key}) => /\p{Script=Han}/u.test(key));
  const latin = members.filter(member => !han.includes(member));
  const group = (list: typeof members) => list.map(({key}) => `(${key})`).join('|');
  const source = [latin.length && `(?<![\\p{L}\\p{M}])(?:${group(latin)})(?![\\p{L}\\p{M}])`, han.length && group(han)].filter(Boolean).join('|');
  return {members: [...latin, ...han], pattern: new RegExp(source, exactCase ? 'u' : 'iu')};
});
// Hold a full page of node names, so a refresh never evicts names it is about to ask for again.
export const regionOf = boundedMemo((name: string): string | null => {
  // Prefer the first location, then the longest alias (Indonesia before India), then priority.
  let chosen: {iso: string; index: number; length: number; rank: number} | undefined;
  for (const {members, pattern} of matchers) {
    const match = pattern.exec(name);
    if (!match) continue;
    const {iso, rank} = members[match.findIndex((group, i) => i > 0 && group !== undefined) - 1];
    const {index, 0: text} = match;
    if (!chosen || index < chosen.index || (index === chosen.index && (text.length > chosen.length || (text.length === chosen.length && rank < chosen.rank))))
      chosen = {iso, index, length: text.length, rank};
  }
  return chosen?.iso ?? null;
}, 2 * MAX_PAGE);
