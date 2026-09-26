import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest} from '../api/model';
import {readGroupEntries} from './groups';

export const groupNames = (text: string): string[] => readGroupEntries(text).map(entry => entry.name);

// The groups a rule in any source may name: every loaded source's, with the one being edited read from its draft.
export function allGroupNames(sources: ConfigSource[], draft?: {id: string; content: string}): string[] {
  const texts = sources.map(source => (source.id === draft?.id ? draft.content : source.content));
  return [...new Set(texts.flatMap(text => (text === undefined ? [] : groupNames(text))))];
}

// Hidden paths use a source-kind label and an opaque ID for display and export.
export const redacted = (source: {path: string}) => source.path === '<redacted>' || source.path === '';
export const fileName = (source: {id: string; kind: string; path: string}) =>
  redacted(source) ? (source.kind === 'main' ? 'config.dae' : `${source.kind}-${source.id.slice(0, 8)}.dae`) : source.path.split('/').pop() || 'config.dae';

// IDs identify diagnostics only; paths provide include-resolution identities.
export function validationSources(sources: ConfigSource[], replacement?: {id: string; content: string}): ConfigValidationRequest['sources'] | null {
  const main = sources.find(source => source.kind === 'main');
  if (main?.content === undefined) return null;
  const authored = [main, ...sources.filter(source => source.kind === 'include' && source.content !== undefined && !redacted(source))];
  if (replacement && !authored.some(source => source.id === replacement.id)) return null;
  return authored.map(source => ({
    id: source.id,
    ...(redacted(source) ? {} : {path: source.path}),
    content: source.id === replacement?.id ? replacement.content : source.content!
  }));
}

// honk refuses a write that changes a setting only a restart applies, one error per setting, and names the setting in
// the message; nothing was written, so the draft and every later write stay valid.
export const restartRequired = (diagnostics: ConfigDiagnostic[]) =>
  diagnostics.filter(item => item.level === 'error' && item.code === 'restart-required').length;
