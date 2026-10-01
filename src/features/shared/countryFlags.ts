import {regionOf} from './geo';

const flags = new Map<string, string | null>();
const CACHE_LIMIT = 2048;
const existingFlag = /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}/u;

export function flagForName(name: string): string | null {
  if (flags.has(name)) return flags.get(name)!;
  const region = existingFlag.test(name) ? null : regionOf(name);
  const flag = region ? String.fromCodePoint(...[...region].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65)) : null;
  if (flags.size >= CACHE_LIMIT) flags.delete(flags.keys().next().value!);
  flags.set(name, flag);
  return flag;
}
