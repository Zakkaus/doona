import type {ConfigSource} from '../api/model';
import {blockBody, scanConfig, uncomment, unquote} from './text';

// The patterns of the top-level include sections, as written: relative to the main source's directory, whichever file holds them.
export function includePatterns(text: string): string[] {
  const {blocks} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'include')
    .flatMap(block => blockBody(text, block).map(line => unquote(uncomment(line).trim())))
    .filter(Boolean);
}

export const isGlob = (pattern: string) => /[*?]/.test(pattern);

// `*` and `?` stay within one path segment, as in a shell glob; every other character is literal.
export function globMatch(pattern: string, path: string): boolean {
  const body = pattern
    .replace(/^\.\//, '')
    .split(/([*?])/)
    .map(part => (part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp('^' + body + '$').test(path);
}

export const includedBy = (patterns: string[], path: string) => patterns.some(pattern => globMatch(pattern, path));

// `path` resolved against the directory of the file at `base`, as an absolute POSIX path with `.` and `..` collapsed.
// Names stay as written: a URL would percent-encode a space or CJK and cut the path at `?`.
export function resolveIncludePath(base: string | undefined, path: string) {
  const joined = path.startsWith('/') ? path : (base ?? '').slice(0, (base ?? '').lastIndexOf('/') + 1) + path;
  const parts: string[] = [];
  for (const part of joined.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return '/' + parts.join('/') + (parts.length && /\/\.{0,2}$/.test(joined) ? '/' : '');
}

// Whether a loaded file includes `path`, given relative to the main source's directory as a new source's path is.
// honk resolves every file's patterns from the main source's directory, not from the file holding them. Resolving
// against the main path serves a backend that reports absolute paths as well.
// Null without a main source.
export function includeCheck(sources: Pick<ConfigSource, 'kind' | 'path' | 'content'>[]): ((path: string) => boolean) | null {
  const main = sources.find(source => source.kind === 'main');
  if (!main) return null;
  const patterns = sources.flatMap(source => includePatterns(source.content).map(pattern => resolveIncludePath(main.path, pattern)));
  return path => includedBy(patterns, resolveIncludePath(main.path, path));
}

// The directory of the first pattern that globs file names in a fixed directory, with its trailing slash.
export function includeDirectory(patterns: string[]): string {
  for (const pattern of patterns.map(item => item.replace(/^\.\//, ''))) {
    const slash = pattern.lastIndexOf('/');
    if (slash > 0 && isGlob(pattern.slice(slash)) && !isGlob(pattern.slice(0, slash))) return pattern.slice(0, slash + 1);
  }
  return '';
}

// Why a new source path cannot be sent, as a message key, or null when it can.
export function newSourcePathProblem(
  path: string
): 'config.newSourceControl' | 'config.newSourceAbsolute' | 'config.newSourceSegments' | 'config.newSourceExtension' | null {
  if ([...path].some(char => char.charCodeAt(0) < 0x20 || (char.charCodeAt(0) >= 0x7f && char.charCodeAt(0) <= 0x9f))) return 'config.newSourceControl';
  if (path.startsWith('/')) return 'config.newSourceAbsolute';
  if (path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) return 'config.newSourceSegments';
  if (!/[^/]\.dae$/.test(path)) return 'config.newSourceExtension';
  return null;
}

// An include pattern whose one `*` stands for the new file's name: `<dir>/<head>*<tail>`, with a literal directory and
// a tail ending in `.dae`. The dialog shows `prefix` and `suffix` fixed and asks only for the name.
export type NamePattern = {pattern: string; prefix: string; suffix: string};

export function namePatterns(patterns: string[]): NamePattern[] {
  const found: NamePattern[] = [];
  for (const pattern of patterns.map(item => item.replace(/^\.\//, ''))) {
    const star = pattern.indexOf('*');
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (star < 0 || /[*?]/.test(prefix + suffix) || !prefix.includes('/') || suffix.includes('/') || !suffix.endsWith('.dae')) continue;
    // A directory the path rules refuse, such as one above the main source, cannot hold a created file.
    if (newSourcePathProblem(prefix + 'name' + suffix) || found.some(item => item.pattern === pattern)) continue;
    found.push({pattern, prefix, suffix});
  }
  return found;
}

// Why a name cannot fill a pattern, as a message key, or null when it can. The assembled path goes through the path
// rules, so the name is held to exactly what the backend accepts.
export function newSourceNameProblem(name: string, pattern: NamePattern) {
  if (name.includes('/')) return 'config.newSourceNameSlash' as const;
  const problem = newSourcePathProblem(pattern.prefix + name + pattern.suffix);
  return problem === 'config.newSourceControl' ? ('config.newSourceNameControl' as const) : problem;
}

// The source a created path became. Sources report paths the way the backend does, which may be relative to the main
// source's directory or absolute; a created path has normal segments only, so joining it to that directory suffices.
export function sourceAt(sources: ConfigSource[], path: string): ConfigSource | null {
  const main = sources.find(source => source.kind === 'main');
  const directory = main ? main.path.slice(0, main.path.lastIndexOf('/') + 1) : '';
  return sources.find(source => source.path === path || source.path === directory + path) ?? null;
}
