import type {Message} from './index';
import type {DEFAULT_LANG, Lang} from './languages';

type Reference<M> = M[typeof DEFAULT_LANG & keyof M];

// One table per language in src/i18n/languages.ts, each with exactly the default language's keys: a missing table,
// a missing key or an extra key fails typecheck at the call.
export function defineMessages<M extends Record<Lang, Record<string, Message>>>(
  messages: M & {[L in Lang]: Record<keyof Reference<M>, Message> & Record<Exclude<keyof M[L], keyof Reference<M>>, never>}
): Record<Lang, Record<keyof Reference<M>, Message>> {
  return messages;
}
