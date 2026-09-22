import type {ConfigSource, ConfigValidationRequest} from '../../api/model';
import {readGroupEntries} from '../../dae/groups';

export const groupNames = (text: string): string[] => readGroupEntries(text).map(entry => entry.name);

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
