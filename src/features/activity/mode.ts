import {LocalError} from '../../api/error';
import {scanConfig, type TextBlock, type TextToken} from '../../dae/text';

// The marker lets mode changes remove their catch-all without touching authored rules.
export type OutboundMode = {mode: 'rule'} | {mode: 'direct'} | {mode: 'global'; target: string};

const MODE_MARK = '# doona: outbound mode';
const modeLine = /^(\s*)l4proto\(tcp, udp\) -> (\S+)\s*# doona: outbound mode\s*$/;

function modeRanges(text: string, blocks: TextBlock[], tokens: TextToken[]) {
  return tokens
    .filter(
      token =>
        token.kind === 'comment' && blocks.some(block => block.name === 'routing' && token.from > block.open && token.to < block.close && token.depth === 1)
    )
    .flatMap(token => {
      const from = text.lastIndexOf('\n', token.from - 1) + 1;
      const found = modeLine.exec(text.slice(from, token.to));
      return found ? [{from, to: token.to + (text[token.to] === '\n' ? 1 : 0), target: found[2]}] : [];
    });
}

export function readMode(text: string): OutboundMode {
  const {blocks, tokens} = scanConfig(text);
  const found = modeRanges(text, blocks, tokens)[0];
  return found ? (found.target === 'direct' ? {mode: 'direct'} : {mode: 'global', target: found.target}) : {mode: 'rule'};
}

export function writeMode(text: string, next: OutboundMode): string {
  const scanned = scanConfig(text);
  for (const range of modeRanges(text, scanned.blocks, scanned.tokens).reverse()) text = text.slice(0, range.from) + text.slice(range.to);
  if (next.mode === 'rule') return text;
  const {blocks, tokens} = scanConfig(text);
  const block = blocks.find(block => block.name === 'routing');
  if (!block) throw new LocalError('act.modeNoRouting');
  const body = text.slice(block.open + 1, block.close);
  const indent = body.match(/\n([ \t]+)\S/)?.[1] ?? '    ';
  let at = block.open + 1;
  if (text[at] === '\n') at++;
  let ordinary = false;
  // Mandatory rules must form a prefix or the catch-all cannot preserve their precedence.
  for (let i = 0; i < tokens.length; i++) {
    const arrow = tokens[i];
    if (arrow.from <= block.open || arrow.to > block.close || arrow.depth !== 1 || arrow.parens !== 0 || text.slice(arrow.from, arrow.to) !== '->') continue;
    const target = tokens[i + 1],
      open = tokens[i + 2],
      modifier = tokens[i + 3],
      close = tokens[i + 4];
    const mandatory =
      target &&
      open &&
      modifier &&
      close &&
      text.slice(open.from, open.to) === '(' &&
      text.slice(modifier.from, modifier.to) === 'must' &&
      text.slice(close.from, close.to) === ')';
    if (!mandatory) {
      ordinary = true;
      continue;
    }
    if (ordinary) throw new LocalError('act.modeInterleaved');
    const end = text.indexOf('\n', close.to);
    at = end !== -1 && end < block.close ? end + 1 : close.to;
    const following = tokens[i + 5];
    if (following && following.from < at && following.kind !== 'comment') throw new LocalError('act.modeInterleaved');
  }
  const outbound = next.mode === 'direct' ? 'direct' : next.target;
  return text.slice(0, at) + (text[at - 1] === '\n' ? '' : '\n') + `${indent}l4proto(tcp, udp) -> ${outbound} ${MODE_MARK}\n` + text.slice(at);
}

export const sameMode = (a: OutboundMode, b: OutboundMode) => a.mode === b.mode && (a.mode !== 'global' || b.mode !== 'global' || a.target === b.target);
