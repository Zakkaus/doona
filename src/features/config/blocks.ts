// The line ranges of every top-level `name {` block, each exclusive of its braces. A section may repeat
// (dae merges two `group` sections). Nested sections reuse names (dns has a routing block of its own), so the
// depth is tracked from the start of the file and only a block opened at depth zero counts.
export function topLevelBlocks(lines: string[], name: string): Array<{open: number; close: number}> {
  const header = new RegExp(`^\\s*${name}\\s*\\{\\s*$`);
  const blocks: Array<{open: number; close: number}> = [];
  let depth = 0;
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/#.*$/, '');
    if (open === -1 && depth === 0 && header.test(code)) open = i;
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (open !== -1 && depth === 0) {
      blocks.push({open, close: i});
      open = -1;
    }
  }
  return blocks;
}
export const topLevelBlock = (lines: string[], name: string) => topLevelBlocks(lines, name)[0] ?? null;
