import {LocalError} from '../api/error';
import type {Node} from '../api/model';
import {blockEntries, blockFields, isQuotable, quote, scanConfig, unquote} from './text';
import {quoteName} from './groups';

export type NodeEntry = {name: string; link: string; from: number; to: number; line: number; nameTo: number; linkFrom: number};
export type ChainEntry = {
  name: string;
  hops: Array<{name: string; from: number; to: number}>;
  from: number;
  to: number;
  line: number;
  nameTo: number;
  hopsFrom: number;
};
export const isNodeLink = (value: string) => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value.trim());

// Only named scalar entries have an unambiguous identity without decoding a protocol's share link.
export function readNodeEntries(text: string): NodeEntry[] {
  const {blocks, tokens} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'node')
    .flatMap(block =>
      blockEntries(text, block).flatMap(entry => {
        if (entry.block) return [];
        const parts = tokens.filter(token => token.from >= entry.from && token.to <= entry.to && token.kind !== 'comment');
        if (parts.length < 3 || text.slice(parts[1].from, parts[1].to) !== ':') return [];
        const head = text.slice(parts[0].from, parts[0].to);
        const link = unquote(text.slice(parts[2].from, parts.at(-1)!.to));
        if (!isNodeLink(link) || !isQuotable(link)) return [];
        return [{name: unquote(head), link, from: parts[0].from, to: parts.at(-1)!.to, line: parts[0].line + 1, nameTo: parts[0].to, linkFrom: parts[2].from}];
      })
    );
}

// A proxy chain `name: a -> 'b' -> c` lists its hops entry first. honk splits the raw value at each unquoted arrow
// and trims and unquotes each piece, so a hop such as `hk: east` keeps its colon and space; a value with an unquoted
// `://` is a share link instead.
export function readChainEntries(text: string): ChainEntry[] {
  const {blocks, tokens} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'node')
    .flatMap(block =>
      blockEntries(text, block).flatMap(entry => {
        if (entry.block) return [];
        const parts = tokens.filter(token => token.from >= entry.from && token.to <= entry.to && token.kind !== 'comment');
        if (parts.length < 3 || text.slice(parts[1].from, parts[1].to) !== ':') return [];
        const value = parts.slice(2);
        const raw = (index: number) => text.slice(value[index].from, value[index].to);
        if (value.some((token, i) => raw(i) === ':' && value[i + 1]?.from === token.to && raw(i + 1).startsWith('//'))) return [];
        const arrows = value.filter((token, i) => token.kind === 'text' && raw(i) === '->');
        if (!arrows.length) return [];
        const bounds = [parts[1].to, ...arrows.flatMap(arrow => [arrow.from, arrow.to]), value.at(-1)!.to];
        const hops = [];
        for (let i = 0; i < bounds.length; i += 2) {
          const piece = text.slice(bounds[i], bounds[i + 1]);
          const from = bounds[i] + piece.length - piece.trimStart().length;
          const to = Math.max(from, bounds[i + 1] - (piece.length - piece.trimEnd().length));
          hops.push({name: unquote(text.slice(from, to)), from, to});
        }
        const head = text.slice(parts[0].from, parts[0].to);
        return [{name: unquote(head), hops, from: parts[0].from, to: value.at(-1)!.to, line: parts[0].line + 1, nameTo: parts[0].to, hopsFrom: value[0].from}];
      })
    );
}

export type NodeReferrer = {kind: 'group' | 'chain' | 'dns'; name: string};

type Reference = {from: number; to: number; by: NodeReferrer};
const reference = (from: number, to: number, kind: NodeReferrer['kind'], name: string): Reference => ({from, to, by: {kind, name}});

// Each place that names a node, with what names it: a group, a proxy chain or a DNS upstream.
function nameReferences(text: string, name: string): Reference[] {
  const {blocks, tokens} = scanConfig(text);
  const groups = blocks
    .filter(block => block.name === 'group')
    .flatMap(block =>
      block.children.flatMap(group =>
        blockFields(text, group, tokens).flatMap(field => {
          if (field.name === 'default' || field.name === 'final' || field.name === 'exit')
            return unquote(field.value) === name ? [reference(field.valueTo - field.value.length, field.valueTo, 'group', group.name)] : [];
          if (field.name !== 'filter') return [];
          const parts = tokens.filter(token => token.from >= field.valueFrom && token.to <= field.valueTo);
          const refs: Reference[] = [];
          const raw = (index: number) => (parts[index] ? text.slice(parts[index].from, parts[index].to) : '');
          for (let i = 0; i < parts.length - 2; i++) {
            if (!/^(?:&&)?!?name$/.test(raw(i)) || raw(i + 1) !== '(') continue;
            for (let j = i + 2; j < parts.length && raw(j) !== ')'; j++) {
              if ((raw(j - 1) === '(' || raw(j - 1) === ',') && (raw(j + 1) === ',' || raw(j + 1) === ')') && unquote(raw(j)) === name)
                refs.push(reference(parts[j].from, parts[j].to, 'group', group.name));
            }
          }
          return refs;
        })
      )
    );
  const dns = blocks
    .filter(block => block.name === 'dns')
    .flatMap(block => block.children.filter(child => child.name === 'upstream'))
    .flatMap(block =>
      blockFields(text, block, tokens).flatMap(field => {
        const parts = tokens.filter(token => token.from >= field.valueFrom && token.to <= field.valueTo && token.kind !== 'comment');
        const target = parts.at(-1);
        const arrow = parts.at(-2);
        return target && arrow && text.slice(arrow.from, arrow.to) === '->' && unquote(text.slice(target.from, target.to)) === name
          ? [reference(target.from, target.to, 'dns', field.name)]
          : [];
      })
    );
  const chains = readChainEntries(text).flatMap(chain =>
    chain.hops.filter(hop => hop.name === name).map(hop => reference(hop.from, hop.to, 'chain', chain.name))
  );
  return [...groups, ...dns, ...chains];
}
export const nodeReferenced = (text: string, name: string) => nameReferences(text, name).length > 0;
export function nodeReferrers(text: string, name: string): NodeReferrer[] {
  const unique = new Map(nameReferences(text, name).map(ref => [`${ref.by.kind}:${ref.by.name}`, ref.by]));
  return [...unique.values()];
}

// The chain as the dialog read it, still declared once with the same hops.
function currentChain(text: string, original: ChainEntry): ChainEntry {
  const entries = readChainEntries(text).filter(entry => entry.name === original.name);
  const hops = (entry: ChainEntry) => JSON.stringify(entry.hops.map(hop => hop.name));
  if (entries.length !== 1 || hops(entries[0]) !== hops(original)) throw new LocalError('nodes.editNodeMissing');
  return entries[0];
}

// Deletes the chain's line, comment included, or only the entry when it shares a line with other text.
export function removeChainEntry(text: string, original: ChainEntry): string {
  const {from, to} = currentChain(text, original);
  const start = text.lastIndexOf('\n', from - 1) + 1;
  const newline = text.indexOf('\n', to);
  const end = newline === -1 ? text.length : newline;
  if (/\S/.test(text.slice(start, from)) || !/^\s*(?:#.*)?$/.test(text.slice(to, end))) return text.slice(0, from) + text.slice(to);
  return text.slice(0, start) + text.slice(newline === -1 ? end : end + 1);
}

// honk's hop rules as far as the node catalog shows them: the protocol, and XHTTP among the stream transports. Vision,
// Encryption, TCP multiplexing and ECH are not in the catalog, so honk's own check reports them.
type HopNode = Pick<Node, 'name' | 'protocol' | 'stream_transport'>;
const tunneled = new Set(['socks5', 'ss', 'shadowsocks', 'trojan', 'vmess', 'vless']);
export const chainHopCandidate = (node: Pick<Node, 'protocol'>) => !['chain', 'direct', 'block'].includes(node.protocol ?? '');
// Whether a node can be a hop after the entry: dialed inside the stream the hops before it opened.
export const tunnelDialable = (node: Pick<Node, 'protocol' | 'stream_transport'>) => tunneled.has(node.protocol ?? '') && node.stream_transport !== 'xhttp';
export type ChainHopCode = 'invalid-chain-hop-reference' | 'ambiguous-chain-hop-reference' | 'unsupported-chain-hop';
export function chainHopProblem(nodes: readonly HopNode[], name: string, index: number): ChainHopCode | null {
  const matches = nodes.filter(node => node.name === name);
  if (matches.length !== 1) return matches.length ? 'ambiguous-chain-hop-reference' : 'invalid-chain-hop-reference';
  return !chainHopCandidate(matches[0]) || (index > 0 && !tunnelDialable(matches[0])) ? 'unsupported-chain-hop' : null;
}
// What rules out UDP through the chain by protocol alone: a hop that cannot be tunnel-dialed, then an exit that is
// neither Trojan nor VLESS. null when the hops' own UDP settings decide.
export function chainUdpProblem(hops: ReadonlyArray<Pick<Node, 'name' | 'protocol' | 'stream_transport'>>) {
  const hop = hops.find(node => !tunnelDialable(node));
  if (hop) return {kind: 'hop' as const, name: hop.name};
  const exit = hops.at(-1);
  return exit && exit.protocol !== 'trojan' && exit.protocol !== 'vless' ? {kind: 'exit' as const, name: exit.name} : null;
}

type ChainUpdate = {name: string; hops: string[]};
function chainText(text: string, next: ChainUpdate, renamedFrom: string | null) {
  if (next.hops.length < 2 || next.hops.length > 4) throw new LocalError('nodes.proxyChain.hopCount');
  if (!next.name || !isQuotable(next.name) || next.hops.some(hop => !hop || !isQuotable(hop))) throw new LocalError('config.unquotable');
  if (next.name !== renamedFrom && [...readNodeEntries(text), ...readChainEntries(text)].some(entry => entry.name === next.name))
    throw new LocalError('nodes.nameTaken');
  return {name: quote(next.name), value: next.hops.map(quoteName).join(' -> ')};
}

// Replaces the chain's name and hops; a rename also rewrites what names the chain, as a node rename does.
export function writeChainEntry(text: string, original: ChainEntry, next: ChainUpdate): string {
  const entry = currentChain(text, original);
  const {name, value} = chainText(text, next, original.name);
  const hops = next.hops.join('\n') !== entry.hops.map(hop => hop.name).join('\n') ? {from: entry.hopsFrom, to: entry.to, text: value} : null;
  return rewriteEntry(text, original.name, next.name, {from: entry.from, to: entry.nameTo, text: name}, hops);
}

// Adds the chain at the end of the last `node {}` block, indented as that block's entries are, or in a new block; lines
// end as the file's do.
export function appendChainEntry(text: string, next: ChainUpdate): string {
  const {name, value} = chainText(text, next, null);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = scanConfig(text)
    .blocks.filter(block => block.name === 'node')
    .at(-1);
  if (!block) return `${text.trimEnd()}${text.trim() ? eol + eol : ''}node {${eol}  ${name}: ${value}${eol}}${eol}`;
  const indent = text.slice(block.open + 1, block.close).match(/\n([ \t]+)\S/)?.[1] ?? '  ';
  const closeLine = text.lastIndexOf('\n', block.close - 1) + 1;
  // A `}` after other text moves to a line of its own, and the space before it is dropped.
  const [head, tail] = /^[ \t]*$/.test(text.slice(closeLine, block.close))
    ? [text.slice(0, closeLine), text.slice(closeLine)]
    : [text.slice(0, block.close).trimEnd() + eol, text.slice(block.close)];
  return `${head}${indent}${name}: ${value}${eol}${tail}`;
}

export function writeNodeEntry(text: string, original: NodeEntry, next: {name: string; link: string}): string {
  const all = readNodeEntries(text);
  const entries = all.filter(entry => entry.name === original.name);
  if (entries.length !== 1 || entries[0].link !== original.link) throw new LocalError('nodes.editNodeMissing');
  if (!next.name || !isQuotable(next.name) || !isNodeLink(next.link) || !isQuotable(next.link)) throw new LocalError('config.unquotable');
  if (next.name !== original.name && all.some(entry => entry.name === next.name)) throw new LocalError('nodes.nameTaken');
  const entry = entries[0];
  const link = next.link !== original.link ? {from: entry.linkFrom, to: entry.to, text: quote(next.link)} : null;
  return rewriteEntry(text, original.name, next.name, {from: entry.from, to: entry.nameTo, text: quote(next.name)}, link);
}

type Edit = {from: number; to: number; text: string};
// Writes an entry's value when it changed and its name when renamed, with every reference to the old name.
function rewriteEntry(text: string, from: string, to: string, name: Edit, value: Edit | null): string {
  const changes = value ? [value] : [];
  if (to !== from) changes.push(name, ...nameReferences(text, from).map(ref => ({...ref, text: quoteName(to)})));
  return changes.sort((a, b) => b.from - a.from).reduce((out, change) => out.slice(0, change.from) + change.text + out.slice(change.to), text);
}
