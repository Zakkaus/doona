import {LocalError} from '../api/error';
import {blockEntries, blockFields, isBareName, quote, scanConfig, unquote, type TextToken} from './text';

// The four ways a tagged entry is written: `tag: 'url'`, `tag: 'url'(UA)`, the old block `tag: { url: … }`, and
// `tag: 'url' { … }`, whose options sit one key per line.
export type SubscriptionForm = 'short' | 'agent' | 'block' | 'options';
export type SubscriptionOption = {name: string; value: string};
export type SubscriptionText = {
  tag: string;
  url: string;
  form: SubscriptionForm;
  // Options as written, values quotes included; shown and kept, never changed here.
  options: SubscriptionOption[];
  // The entry's lines, and within them where the tag and the URL are written.
  from: number;
  to: number;
  line: number;
  tagAt: {from: number; to: number};
  urlAt: {from: number; to: number};
};

const raw = (text: string, token: TextToken | undefined) => (token ? text.slice(token.from, token.to) : '');
const named = (text: string, token: TextToken | undefined) => !!token && (token.kind === 'text' || token.kind === 'quoted') && raw(text, token) !== ':';

// Entries written another way (no tag, an unquoted URL, two on one line) are left out: doona does not rewrite them.
export function readSubscriptionEntries(text: string): SubscriptionText[] {
  const {blocks, tokens} = scanConfig(text);
  const entries: SubscriptionText[] = [];
  for (const section of blocks.filter(block => block.name === 'subscription')) {
    for (const range of blockEntries(text, section)) {
      const head = range.block?.open ?? range.to;
      const own = tokens.filter(token => token.from >= range.from && token.from < range.to && token.depth === section.depth + 1 && token.kind !== 'comment');
      const lead = own.filter(token => token.from < head);
      const [tag, colon, value] = lead;
      if (!named(text, tag) || raw(text, colon) !== ':') continue;
      const base = {tag: unquote(raw(text, tag)), from: range.from, to: range.to, line: tag.line + 1, tagAt: {from: tag.from, to: tag.to}};
      const block = range.block;
      if (block) {
        if (own.some(token => token.from > block.to)) continue;
        const fields = blockFields(text, block, tokens);
        if (lead.length === 3 && value.kind === 'quoted') {
          const options = fields.map(field => ({name: field.name, value: field.value}));
          entries.push({...base, url: unquote(raw(text, value)), form: 'options', options, urlAt: {from: value.from, to: value.to}});
          continue;
        }
        const url = fields.find(field => field.name === 'url');
        const at = url && tokens.find(token => token.from >= url.valueFrom && token.from < url.valueTo);
        if (lead.length !== 2 || !url || !at || at.kind !== 'quoted' || at.to !== url.valueTo) continue;
        const options = fields.filter(field => field !== url).map(field => ({name: field.name, value: field.value}));
        entries.push({...base, url: unquote(raw(text, at)), form: 'block', options, urlAt: {from: at.from, to: at.to}});
        continue;
      }
      if (value?.kind !== 'quoted') continue;
      const rest = own.slice(3);
      const urlAt = {from: value.from, to: value.to};
      if (!rest.length) {
        entries.push({...base, url: unquote(raw(text, value)), form: 'short', options: [], urlAt});
        continue;
      }
      const close = rest.at(-1)!;
      if (raw(text, rest[0]) !== '(' || raw(text, close) !== ')' || close.parens !== 1 || rest.slice(1, -1).some(token => token.parens !== 1)) continue;
      const ua = text.slice(rest[0].to, close.from).trim();
      entries.push({...base, url: unquote(raw(text, value)), form: 'agent', options: [{name: 'ua', value: ua}], urlAt});
    }
  }
  return entries;
}

// Changes the tag and the URL of one entry where they are written; its form, its options, its comments and every
// other entry stay as they were. A tag keeps its quotes when it had them.
export function writeSubscriptionEntry(text: string, tag: string, next: {tag: string; url: string}): string {
  const entries = readSubscriptionEntries(text);
  const entry = entries.find(entry => entry.tag === tag);
  if (!entry) throw new LocalError('nodes.editMissing');
  if (next.tag !== tag && entries.some(other => other.tag === next.tag)) throw new LocalError('nodes.tagTaken');
  const edits: Array<{from: number; to: number; text: string}> = [];
  if (next.url !== entry.url) edits.push({...entry.urlAt, text: quote(next.url)});
  if (next.tag !== tag) {
    const quoted = /^['"]/.test(text.slice(entry.tagAt.from, entry.tagAt.to));
    edits.push({...entry.tagAt, text: quoted || !isBareName(next.tag) ? quote(next.tag) : next.tag});
  }
  return edits.sort((a, b) => b.from - a.from).reduce((out, edit) => out.slice(0, edit.from) + edit.text + out.slice(edit.to), text);
}
