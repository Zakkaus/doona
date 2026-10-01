import {regions} from '../../dae/regions';
import {boundedMemo} from './boundedMemo';

const aliases = regions.flatMap(([iso, keys]) =>
  [...new Set([iso, ...keys].map(key => (key.toUpperCase() === iso ? iso : key)))].map(key => ({
    iso,
    pattern: new RegExp(
      /\p{Script=Han}/u.test(key) ? key : `(?<![\\p{L}\\p{M}])${key}(?![\\p{L}\\p{M}])`,
      key.toUpperCase() === iso && ['IN', 'IT', 'MY', 'NO', 'ID'].includes(iso) ? 'u' : 'iu'
    )
  }))
);
export const regionOf = boundedMemo((name: string): string | null => {
  // Prefer the first location, then the longest alias (Indonesia before India).
  let chosen: {iso: string; index: number; length: number} | undefined;
  for (const {iso, pattern} of aliases) {
    const match = pattern.exec(name);
    if (match && (!chosen || match.index < chosen.index || (match.index === chosen.index && match[0].length > chosen.length)))
      chosen = {iso, index: match.index, length: match[0].length};
  }
  return chosen?.iso ?? null;
});
