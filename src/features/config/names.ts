// Group names a dae main source defines, for completion after "->" and "fallback:".
export function groupNames(text: string): string[] {
  const body = /(^|\n)group\s*\{([\s\S]*?)\n\}/.exec(text)?.[2] ?? '';
  return [...body.matchAll(/^\s*([A-Za-z_][\w-]*)\s*\{/gm)].map(match => match[1]);
}

// A source as the editor submits it: the accepted id names the file, so the display path stays out of the
// request. The backend may redact that path and would refuse it back as an authority.
export const candidate = (source: {id: string}, content: string) => ({id: source.id, content});
