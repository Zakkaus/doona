import type {ConfigSource, ConfigValidationRequest} from '../../api/model';
import {readGroupEntries} from './groups';

export const groupNames = (text: string): string[] => readGroupEntries(text).map(entry => entry.name);

// The backend redacts the path of a file that holds a secret; the file is then named by its kind and the
// start of its id, and a name for export falls back to one by kind.
export const redacted = (source: {path: string}) => source.path === '<redacted>' || source.path === '';
export const fileName = (source: {id: string; kind: string; path: string}) =>
  redacted(source) ? (source.kind === 'main' ? 'config.dae' : `${source.kind}-${source.id.slice(0, 8)}.dae`) : source.path.split('/').pop() || 'config.dae';

// IDs identify diagnostics only; paths provide include-resolution identities.
export function validationSources(sources: ConfigSource[], replacement?: {id: string; content: string}): ConfigValidationRequest['sources'] | null {
  const main = sources.find(source => source.kind === 'main');
  if (!main) return null;
  const authored = [main, ...sources.filter(source => source.kind === 'include')];
  if (authored.some(source => source.content === undefined)) return null;
  return authored.map(source => ({
    id: source.id,
    ...(redacted(source) ? {} : {path: source.path}),
    content: source.id === replacement?.id ? replacement.content : source.content!
  }));
}
