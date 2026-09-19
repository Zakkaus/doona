// The line range of the first top-level `name {` block, exclusive of its braces; null when the text has
// none. Nested sections reuse names (dns has a routing block of its own), so the depth is tracked from the
// start of the file and only a block opened at depth zero counts.
export function topLevelBlock(lines: string[], name: string): {open: number; close: number} | null {
  const header = new RegExp(`^\\s*${name}\\s*\\{\\s*$`);
  let depth = 0;
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/#.*$/, '');
    if (open === -1 && depth === 0 && header.test(code)) open = i;
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (open !== -1 && depth === 0) return {open, close: i};
  }
  return null;
}
