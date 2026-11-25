import {LocalError} from '../api/error';
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

// Each place that names a node, with what names it: a group, a proxy chain or a DNS upstream.
function nameReferences(text: string, name: string) {
  const {blocks, tokens} = scanConfig(text);
  const groups = blocks
    .filter(block => block.name === 'group')
    .flatMap(block =>
      block.children.flatMap(group =>
        blockFields(text, group, tokens).flatMap(field => {
          if (field.name === 'default' || field.name === 'final' || field.name === 'exit')
            return unquote(field.value) === name ? [{from: field.valueTo - field.value.length, to: field.valueTo, by: group.name}] : [];
          if (field.name !== 'filter') return [];
          const parts = tokens.filter(token => token.from >= field.valueFrom && token.to <= field.valueTo);
          const refs: Array<{from: number; to: number; by: string}> = [];
          const raw = (index: number) => (parts[index] ? text.slice(parts[index].from, parts[index].to) : '');
          for (let i = 0; i < parts.length - 2; i++) {
            if (!/^(?:&&)?!?name$/.test(raw(i)) || raw(i + 1) !== '(') continue;
            for (let j = i + 2; j < parts.length && raw(j) !== ')'; j++) {
              if ((raw(j - 1) === '(' || raw(j - 1) === ',') && (raw(j + 1) === ',' || raw(j + 1) === ')') && unquote(raw(j)) === name)
                refs.push({from: parts[j].from, to: parts[j].to, by: group.name});
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
          ? [{from: target.from, to: target.to, by: field.name}]
          : [];
      })
    );
  const chains = readChainEntries(text).flatMap(chain =>
    chain.hops.filter(hop => hop.name === name).map(hop => ({from: hop.from, to: hop.to, by: chain.name}))
  );
  return [...groups, ...dns, ...chains];
}
export const nodeReferenced = (text: string, name: string) => nameReferences(text, name).length > 0;
export const nodeReferrers = (text: string, name: string) => [...new Set(nameReferences(text, name).map(ref => ref.by))];

// Deletes the chain's line, comment included, or only the entry when it shares a line with other text.
export function removeChainEntry(text: string, original: ChainEntry): string {
  const entries = readChainEntries(text).filter(entry => entry.name === original.name);
  const hops = (entry: ChainEntry) => JSON.stringify(entry.hops.map(hop => hop.name));
  if (entries.length !== 1 || hops(entries[0]) !== hops(original)) throw new LocalError('nodes.editNodeMissing');
  const {from, to} = entries[0];
  const start = text.lastIndexOf('\n', from - 1) + 1;
  const newline = text.indexOf('\n', to);
  const end = newline === -1 ? text.length : newline;
  if (/\S/.test(text.slice(start, from)) || !/^\s*(?:#.*)?$/.test(text.slice(to, end))) return text.slice(0, from) + text.slice(to);
  return text.slice(0, start) + text.slice(newline === -1 ? end : end + 1);
}

export function writeNodeEntry(text: string, original: NodeEntry, next: {name: string; link: string}): string {
  const all = readNodeEntries(text);
  const entries = all.filter(entry => entry.name === original.name);
  if (entries.length !== 1 || entries[0].link !== original.link) throw new LocalError('nodes.editNodeMissing');
  if (!next.name || !isQuotable(next.name) || !isNodeLink(next.link) || !isQuotable(next.link)) throw new LocalError('config.unquotable');
  if (next.name !== original.name && all.some(entry => entry.name === next.name)) throw new LocalError('nodes.nameTaken');
  const entry = entries[0];
  const changes = [];
  if (next.name !== original.name) changes.push({from: entry.from, to: entry.nameTo, text: quote(next.name)});
  if (next.link !== original.link) changes.push({from: entry.linkFrom, to: entry.to, text: quote(next.link)});
  if (next.name !== original.name) changes.push(...nameReferences(text, original.name).map(ref => ({...ref, text: quoteName(next.name)})));
  return changes.sort((a, b) => b.from - a.from).reduce((out, change) => out.slice(0, change.from) + change.text + out.slice(change.to), text);
}
