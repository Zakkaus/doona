// Return brace-exclusive ranges for top-level blocks only; repeated sections are valid and nested names must not match.
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
