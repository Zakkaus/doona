// The outbound mode as a staged configuration edit: honk keeps no native mode switch, so doona writes one
// catch-all rule into the routing section and reloads. `rule` is the configuration as written; `direct`
// sends everything the must-rules leave straight out; `global` sends it all through one outbound. The rule
// carries a marker so it can be found, replaced and removed without touching the rest of the section.
export type OutboundMode = {mode: 'rule'} | {mode: 'direct'} | {mode: 'global'; target: string};

export const MODE_MARK = '# doona: outbound mode';
const modeLine = /^(\s*)l4proto\(tcp, udp\) -> (\S+)\s*# doona: outbound mode\s*$/;

export function readMode(text: string): OutboundMode {
  for (const line of text.split('\n')) {
    const found = modeLine.exec(line);
    if (found) return found[2] === 'direct' ? {mode: 'direct'} : {mode: 'global', target: found[2]};
  }
  return {mode: 'rule'};
}

// The first top-level routing block's line range, exclusive of its braces; null when the text has none.
// The dns section has a routing block of its own, so the depth is tracked from the start of the file.
function routingBlock(lines: string[]): {open: number; close: number} | null {
  let depth = 0;
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/#.*$/, '');
    if (open === -1 && depth === 0 && /^\s*routing\s*\{\s*$/.test(code)) open = i;
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (open !== -1 && depth === 0) return {open, close: i};
  }
  return null;
}

// Presets marked `(must)` keep applying in every mode, as the engine promises; the catch-all goes after the
// last of them so LAN and resolver traffic stays where the author put it.
export function writeMode(text: string, next: OutboundMode): string {
  const lines = text.split('\n').filter(line => !modeLine.test(line));
  if (next.mode === 'rule') return lines.join('\n');
  const block = routingBlock(lines);
  if (!block) throw new Error('no routing section');
  const body = lines.slice(block.open + 1, block.close);
  const indent = body.find(line => line.trim())?.match(/^\s*/)?.[0] ?? '    ';
  let at = block.open + 1;
  for (let i = block.close - 1; i > block.open; i--) {
    if (/\(must\)\s*(#.*)?$/.test(lines[i])) {
      at = i + 1;
      break;
    }
  }
  const outbound = next.mode === 'direct' ? 'direct' : next.target;
  lines.splice(at, 0, `${indent}l4proto(tcp, udp) -> ${outbound} ${MODE_MARK}`);
  return lines.join('\n');
}

export const sameMode = (a: OutboundMode, b: OutboundMode) => a.mode === b.mode && (a.mode !== 'global' || b.mode !== 'global' || a.target === b.target);
