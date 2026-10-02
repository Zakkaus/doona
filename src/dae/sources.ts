import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest} from '../api/model';
import type {Key} from '../i18n';
import {readGroupEntries, type GroupEntry} from './groups';

// The groups a rule in any source may name: every loaded source's, with the one being edited read from its draft.
// A rule names a group by its header as written, so two headers that unquote alike are still two groups.
export function allGroupNames(sources: ConfigSource[], draft?: {id: string; content: string}): Pick<GroupEntry, 'name' | 'written'>[] {
  const texts = sources.map(source => (source.id === draft?.id ? draft.content : source.content));
  const entries = texts.flatMap(text => (text === undefined ? [] : readGroupEntries(text)));
  return [...new Map(entries.map(({name, written}) => [written, {name, written}])).values()];
}

// Hidden paths use a source-kind label and an opaque ID for display and export.
export const redacted = (source: {path: string}) => source.path === '<redacted>' || source.path === '';
export const fileName = (source: {id: string; kind: string; path: string}) =>
  redacted(source) ? (source.kind === 'main' ? 'config.dae' : `${source.kind}-${source.id.slice(0, 8)}.dae`) : source.path.split('/').pop() || 'config.dae';

// IDs identify diagnostics only; paths provide include-resolution identities.
export function validationSources(sources: ConfigSource[], replacement?: {id: string; content: string}): ConfigValidationRequest['sources'] | null {
  const main = sources.find(source => source.kind === 'main');
  if (!main) return null;
  const authored = [main, ...sources.filter(source => source.kind === 'include' && !redacted(source))];
  if (replacement && !authored.some(source => source.id === replacement.id)) return null;
  return authored.map(source => ({
    id: source.id,
    ...(redacted(source) ? {} : {path: source.path}),
    content: source.id === replacement?.id ? replacement.content : source.content
  }));
}

// honk refuses a write that changes a setting only a restart applies, one error per setting, and names the setting in
// the message ("Changing global.log_level requires restarting honk"); nothing was written, so the draft and every
// later write stay valid.
export type RestartSetting = {key: string | null; sourceId: string; line: number | null};
export const restartSettings = (diagnostics: ConfigDiagnostic[]): RestartSetting[] =>
  diagnostics
    .filter(item => item.level === 'error' && item.code === 'restart-required')
    .map(item => ({key: /\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b/.exec(item.message)?.[0] ?? (item.message || null), sourceId: item.source_id, line: item.line}));
export const restartRequired = (diagnostics: ConfigDiagnostic[]) => restartSettings(diagnostics).length;

// The label of each kind of configuration source.
export const sourceKinds: Record<ConfigSource['kind'], Key> = {
  main: 'config.kind.main',
  include: 'config.kind.include',
  subscription: 'config.kind.subscription',
  generated: 'config.kind.generated'
};
