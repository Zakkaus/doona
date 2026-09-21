import type {Lang, Message} from './index';

export function defineMessages<TW extends Record<string, Message>, CN extends Record<keyof TW, Message>, EN extends Record<keyof TW, Message>>(messages: {
  'zh-TW': TW;
  'zh-CN': CN & Record<Exclude<keyof CN, keyof TW>, never>;
  en: EN & Record<Exclude<keyof EN, keyof TW>, never>;
}): Record<Lang, Record<keyof TW, Message>> {
  return messages;
}
