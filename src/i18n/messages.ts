import type {Lang, Message} from './index';
import {messages as shell} from '../shell/messages';
import {messages as ui} from '../ui/messages';
import {messages as overview} from '../features/overview/messages';
import {messages as connections} from '../features/connections/messages';
import {messages as flows} from '../features/flows/messages';
import {messages as policies} from '../features/policies/messages';
import {messages as rules} from '../features/rules/messages';
import {messages as dns} from '../features/dns/messages';
import {messages as events} from '../features/events/messages';
import {messages as settings} from '../features/settings/messages';

type Intersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;
function merge<T extends Record<Lang, Record<string, Message>>[]>(...modules: T) {
  return Object.fromEntries((['zh-TW', 'zh-CN', 'en'] as const).map(lang => [lang, Object.assign({}, ...modules.map(module => module[lang]))])) as {
    [L in Lang]: Intersection<T[number][L]>;
  };
}
export const modules = [shell, ui, overview, connections, flows, policies, rules, dns, events, settings] as const;
export const table = merge(...modules);
export type Key = keyof (typeof table)['zh-TW'];
