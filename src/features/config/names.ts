import {readGroupEntries} from './groups';

export const groupNames = (text: string): string[] => readGroupEntries(text).map(entry => entry.name);

// The backend redacts the path of a file that holds a secret; the file is then named by its kind and the
// start of its id, and a name for export falls back to one by kind.
export const redacted = (source: {path: string}) => source.path === '<redacted>' || source.path === '';
export const fileName = (source: {id: string; kind: string; path: string}) =>
  redacted(source) ? (source.kind === 'main' ? 'config.dae' : `${source.kind}-${source.id.slice(0, 8)}.dae`) : source.path.split('/').pop() || 'config.dae';

// A source as the editor submits it: the accepted id names the file, so the display path stays out of the
// request. The backend may redact that path and would refuse it back as an authority.
export const candidate = (source: {id: string}, content: string) => ({id: source.id, content});
