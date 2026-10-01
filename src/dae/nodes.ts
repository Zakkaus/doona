import {LocalError} from '../api/error';
import {blockEntries, blockFields, isQuotable, quote, scanConfig, unquote} from './text';
import {quoteName} from './groups';

export type NodeEntry = {name: string; link: string; from: number; to: number; line: number; nameTo: number; linkFrom: number};
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

function nameReferences(text: string, name: string) {
  const {blocks, tokens} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'group')
    .flatMap(block =>
      block.children.flatMap(group =>
        blockFields(text, group, tokens)
          .filter(field => field.name === 'filter')
          .flatMap(field => {
            const parts = tokens.filter(token => token.from >= field.valueFrom && token.to <= field.valueTo);
            const refs: Array<{from: number; to: number; group: string}> = [];
            const raw = (index: number) => (parts[index] ? text.slice(parts[index].from, parts[index].to) : '');
            for (let i = 0; i < parts.length - 2; i++) {
              if (!/^(?:&&)?!?name$/.test(raw(i)) || raw(i + 1) !== '(') continue;
              for (let j = i + 2; j < parts.length && raw(j) !== ')'; j++) {
                if ((raw(j - 1) === '(' || raw(j - 1) === ',') && (raw(j + 1) === ',' || raw(j + 1) === ')') && unquote(raw(j)) === name)
                  refs.push({from: parts[j].from, to: parts[j].to, group: group.name});
              }
            }
            return refs;
          })
      )
    );
}
export const groupsNamingNode = (text: string, name: string) => [...new Set(nameReferences(text, name).map(ref => ref.group))];

export function writeNodeEntry(text: string, original: NodeEntry, next: {name: string; link: string}): string {
  const entries = readNodeEntries(text).filter(entry => entry.name === original.name);
  if (entries.length !== 1 || entries[0].link !== original.link) throw new LocalError('nodes.editNodeMissing');
  if (!next.name || !isQuotable(next.name) || !isNodeLink(next.link) || !isQuotable(next.link)) throw new LocalError('config.unquotable');
  if (next.name !== original.name && readNodeEntries(text).some(entry => entry.name === next.name)) throw new LocalError('nodes.nameTaken');
  const entry = entries[0];
  const changes = [];
  if (next.name !== original.name) changes.push({from: entry.from, to: entry.nameTo, text: quoteName(next.name)});
  if (next.link !== original.link) changes.push({from: entry.linkFrom, to: entry.to, text: quote(next.link)});
  if (next.name !== original.name) changes.push(...nameReferences(text, original.name).map(ref => ({...ref, text: quoteName(next.name)})));
  return changes.sort((a, b) => b.from - a.from).reduce((out, change) => out.slice(0, change.from) + change.text + out.slice(change.to), text);
}
