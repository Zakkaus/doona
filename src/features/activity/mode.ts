import {LocalError} from '../../api/error';
import {topLevelBlock} from '../config/blocks';

// honk has no native mode switch, so doona writes a marked catch-all rule into routing. The marker allows replacement or removal without touching other rules.
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

// Presets marked `(must)` keep applying in every mode, as the engine promises; the catch-all goes after the
// last of them so LAN and resolver traffic stays where the author put it.
export function writeMode(text: string, next: OutboundMode): string {
  const lines = text.split('\n').filter(line => !modeLine.test(line));
  if (next.mode === 'rule') return lines.join('\n');
  const block = topLevelBlock(lines, 'routing');
  if (!block) throw new LocalError('act.modeNoRouting');
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
