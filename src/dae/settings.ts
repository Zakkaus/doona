import {LocalError} from '../api/error';
import type {Key} from '../i18n';
import {blockFields, isQuotable, quote, scanConfig, unquote} from './text';

// The headed groups a settings form shows, in order.
export const settingGroups = {
  interfaces: 'config.globalGroup.interfaces',
  logging: 'config.globalGroup.logging',
  checks: 'config.globalGroup.checks',
  dialing: 'config.globalGroup.dialing',
  bandwidth: 'config.globalGroup.bandwidth',
  storage: 'config.globalGroup.storage'
} as const satisfies Record<string, Key>;
export type SettingField = {
  key: string;
  label: Key;
  group: keyof typeof settingGroups;
  type: 'boolean' | 'integer' | 'text' | 'list' | 'duration';
  max?: string;
  hexMax?: string;
  bareItems?: boolean;
  choices?: readonly string[];
  units?: readonly string[];
};
export type SettingsSection = {name: string; fields: readonly SettingField[]};
// A setting edits in a number field when it takes only a whole number within a safe integer; one written in hex, one that
// also takes a keyword, and a u64 that can exceed a safe integer stay text.
export function numberSetting(field: SettingField): boolean {
  return field.type === 'integer' && !field.choices && !field.hexMax && field.max !== undefined && BigInt(field.max) <= BigInt(Number.MAX_SAFE_INTEGER);
}

function settingItems(value: string): string[] {
  const commas = scanConfig(value).tokens.filter(token => value.slice(token.from, token.to) === ',');
  const boundaries = [-1, ...commas.map(token => token.from), value.length];
  return boundaries.slice(1).map((end, index) => unquote(value.slice(boundaries[index] + 1, end).trim()));
}

export function settingValue(field: SettingField, value: string): string {
  const text = unquote(value);
  if (field.type === 'boolean') {
    if (/^(true|yes|1|on)$/i.test(text)) return 'true';
    if (/^(false|no|0|off)$/i.test(text)) return 'false';
  }
  if (field.hexMax && /^(?:0x)?[0-9a-f]+$/i.test(text)) {
    const digits = text.replace(/^0x/i, '');
    const hex = BigInt(`0x${digits}`);
    if (hex <= BigInt(field.hexMax)) return hex.toString();
    if (/^\d+$/.test(digits) && BigInt(digits) <= BigInt(field.hexMax)) return BigInt(digits).toString();
  }
  if (field.type === 'list') {
    return settingItems(value)
      .map(item => (item.includes(',') ? quote(item) : item))
      .join(', ');
  }
  return text;
}

export function serializeSetting(field: SettingField, value: string): string | null {
  if (value === '') return '';
  if (field.choices?.includes(value)) return value;
  if (field.type === 'boolean') return /^(true|false)$/.test(value) ? value : null;
  if (field.type === 'integer') {
    if (!/^\d+$/.test(value) || BigInt(value) > BigInt(field.max!)) return null;
    return field.hexMax ? `0x${BigInt(value).toString(16)}` : value;
  }
  if (field.choices) return null;
  if (field.type === 'duration') {
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value);
    if (!match || !field.units?.includes(match[2] ?? '')) return null;
    const seconds = field.units.includes('h');
    const integer = seconds ? match[2] !== 'ms' : match[2] === 'ms';
    if (integer) {
      if (match[1].includes('.')) return null;
      const scale = match[2] === 'h' ? 3600n : match[2] === 'm' ? 60n : 1n;
      return BigInt(match[1]) * scale <= 18446744073709551615n ? value : null;
    }
    const duration = seconds ? Math.ceil(Number(match[1]) / 1000) : Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    return duration < 18446744073709551616 ? value : null;
  }
  const values = field.type === 'list' ? settingItems(value).filter(Boolean) : [value];
  // A whole quoted list containing a comma is read as legacy aggregate syntax by the engine.
  if (field.type === 'list' && values.length === 1 && values[0].includes(',')) return null;
  if (field.bareItems) return values.length && values.every(value => /^[-\w.*]+$/.test(value)) ? values.join(', ') : null;
  return values.length && values.every(isQuotable) ? values.map(quote).join(', ') : null;
}

// Patch only changed values; comments, whitespace and all other sections retain their original bytes.
export function writeSettings(text: string, section: SettingsSection, index: number, patch: Record<string, string>): string {
  const {blocks, tokens} = scanConfig(text);
  const block = blocks.filter(block => block.name === section.name)[index];
  const fields = block ? blockFields(text, block, tokens) : [];
  const edits: Array<{from: number; to: number; text: string}> = [];
  const added: string[] = [];
  const indent = (block && text.slice(block.open + 1, block.close).match(/\n([ \t]+)\S/)?.[1]) || '  ';
  for (const [key, value] of Object.entries(patch)) {
    const definition = section.fields.find(field => field.key === key);
    const serialized = definition && serializeSetting(definition, value);
    if (serialized === null || serialized === undefined) throw new LocalError('config.globalInvalid');
    const matches = fields.filter(field => field.name === key);
    if (matches.length > 1) throw new LocalError('config.globalDuplicate');
    if (value === '') {
      if (matches.length) edits.push({from: matches[0].from, to: matches[0].to, text: ''});
    } else if (matches.length) {
      const field = matches[0];
      const start = field.valueFrom + (text.slice(field.valueFrom, field.valueTo).match(/^\s*/)?.[0].length ?? 0);
      edits.push({from: start, to: field.valueTo, text: serialized});
    } else added.push(`${indent}${key}: ${serialized}`);
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  if (added.length) {
    const body = added.join(newline) + newline;
    if (block) edits.push({from: block.close, to: block.close, text: newline + body});
    else edits.push({from: text.length, to: text.length, text: `${text && !text.endsWith('\n') ? newline : ''}${section.name} {${newline}${body}}${newline}`});
  }
  for (const edit of edits.sort((a, b) => b.from - a.from)) text = text.slice(0, edit.from) + edit.text + text.slice(edit.to);
  return text;
}
