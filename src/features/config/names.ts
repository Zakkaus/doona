// Group names a dae main source defines, for completion after "->" and "fallback:".
export function groupNames(text: string): string[] {
  const body = /(^|\n)group\s*\{([\s\S]*?)\n\}/.exec(text)?.[2] ?? '';
  return [...body.matchAll(/^\s*([A-Za-z_][\w-]*)\s*\{/gm)].map(match => match[1]);
}
