import {groupNameProblem, readGroupEntries} from '../../../src/dae/groups';
import {scanConfig, unquote} from '../../../src/dae/text';
import {LiteError} from './api';
import {appendEntry, removeEntry} from './config';
import {EMPTY_GROUP_FILTER} from './groupBindings';

export function groupDraftEntry(content: string, name: string) {
  return scanConfig(content)
    .blocks.filter(block => block.name === 'group')
    .flatMap(block => block.children)
    .find(block => block.name === name);
}

export function changeGroupText(content: string, others: string[], original: string, name: string, body: string, duplicate: boolean) {
  const entry = groupDraftEntry(content, original);
  const entries = [content, ...others].flatMap(readGroupEntries);
  if (!entry || entries.filter(item => item.name === original).length !== 1) throw new LiteError('incomplete');
  // A group body may contain quoted braces, but cannot escape into another block.
  if (scanConfig(body).tokens.some(token => token.kind === 'symbol' && ['{', '}'].includes(body.slice(token.from, token.to))))
    throw new LiteError('invalidField');
  if (duplicate) {
    const next = name.trim();
    if (groupNameProblem(next, new Set(entries.map(item => item.name)))) throw new LiteError('invalidField');
    return appendEntry(content, 'group', `${next} {${body}}`);
  }
  if (name !== original) throw new LiteError('invalidField');
  return content.slice(0, entry.open + 1) + body + content.slice(entry.close);
}

const refersTo = (text: string, name: string) =>
  scanConfig(text).tokens.some(token => (token.kind === 'text' || token.kind === 'quoted') && unquote(text.slice(token.from, token.to)) === name);

// Deletion refuses any remaining reference, in this source or another one.
export function deleteGroup(content: string, others: string[], name: string) {
  const block = groupDraftEntry(content, name);
  if (!block) throw new LiteError('conflict');
  if (others.some(text => refersTo(text, name)) || refersTo(content.slice(0, block.from) + content.slice(block.to), name)) throw new LiteError('referenced');
  return removeEntry(content, block);
}

// Only known outbound references are rewritten; unknown uses refuse the rename.
export function renameGroup(content: string, others: string[], original: string, name: string) {
  const block = groupDraftEntry(content, original);
  if (!block) throw new LiteError('conflict');
  if (
    groupNameProblem(
      name,
      new Set(
        [content, ...others]
          .flatMap(readGroupEntries)
          .map(item => item.name)
          .filter(item => item !== original)
      )
    )
  )
    throw new LiteError('invalidField');
  if (others.some(text => refersTo(text, original))) throw new LiteError('referenced');
  const tokens = scanConfig(content).tokens;
  const replacements: Array<{from: number; to: number}> = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!['quoted', 'text'].includes(token.kind) || unquote(content.slice(token.from, token.to)) !== original) continue;
    const prev = (n: number) => (tokens[i - n] ? content.slice(tokens[i - n].from, tokens[i - n].to) : '');
    if (
      token.from === block.from ||
      prev(1) === '->' ||
      (prev(1) === ':' && ['fallback', 'route', 'download_detour'].includes(prev(2))) ||
      (prev(1) === '(' && prev(2) === 'group')
    )
      replacements.push(token);
    else throw new LiteError('referenced');
  }
  return replacements.reverse().reduce((text, range) => text.slice(0, range.from) + name + text.slice(range.to), content);
}

export type GroupChange =
  | {kind: 'added'; name: string; filters: string[]}
  | {kind: 'removed'; name: string}
  | {kind: 'renamed'; before: string; after: string}
  | {kind: 'policy'; name: string; policy: string | null}
  | {kind: 'members'; name: string; added: string[]; removed: string[]}
  | {kind: 'changed'; name: string}
  | {kind: 'other'};

const withoutGroups = (text: string) =>
  scanConfig(text)
    .blocks.filter(block => block.name === 'group')
    .reverse()
    .reduce((rest, block) => rest.slice(0, block.from) + rest.slice(block.to), text);
const sameMembers = (a: string[], b: string[]) => a.join('\n') === b.join('\n');

// What a groups draft changes, one entry per group, so creating a group counts once.
export function groupChanges(before: string, after: string): GroupChange[] {
  const old = readGroupEntries(before);
  const next = readGroupEntries(after);
  const removed = old.filter(entry => !next.some(item => item.name === entry.name));
  const added = next.filter(entry => !old.some(item => item.name === entry.name));
  const changes: GroupChange[] = [];
  for (const entry of removed) {
    const twin = added.findIndex(item => sameMembers(item.filters, entry.filters) && item.policy === entry.policy);
    if (twin >= 0) {
      changes.push({kind: 'renamed', before: entry.name, after: added[twin].name});
      added.splice(twin, 1);
    } else changes.push({kind: 'removed', name: entry.name});
  }
  for (const entry of added) changes.push({kind: 'added', name: entry.name, filters: entry.filters});
  for (const entry of next) {
    const was = old.find(item => item.name === entry.name);
    if (!was) continue;
    if (was.policy !== entry.policy) changes.push({kind: 'policy', name: entry.name, policy: entry.policy});
    if (!sameMembers(was.filters, entry.filters))
      changes.push({
        kind: 'members',
        name: entry.name,
        added: entry.filters.filter(filter => !was.filters.includes(filter)),
        removed: was.filters.filter(filter => !entry.filters.includes(filter))
      });
    if (was.default !== entry.default || was.final !== entry.final || was.interrupt !== entry.interrupt) changes.push({kind: 'changed', name: entry.name});
  }
  if (withoutGroups(before) !== withoutGroups(after)) changes.push({kind: 'other'});
  return changes;
}

// Groups whose only filter is the empty placeholder: honk would apply a group with no nodes.
export const emptyGroups = (content: string) =>
  readGroupEntries(content)
    .filter(entry => entry.filters.length > 0 && entry.filters.every(filter => filter.trim() === EMPTY_GROUP_FILTER))
    .map(entry => entry.name);
