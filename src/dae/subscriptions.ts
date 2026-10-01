import {LocalError} from '../api/error';
import type {Key} from '../i18n';
import {isBareName, isQuotable, quote, scanConfig, unquote, type TextBlock, type TextToken} from './text';

// The entry forms honk reads in a `subscription {}` section, one entry per physical line unless a block follows:
// `tag: url` (bare), `tag: 'url'` (short), `tag: 'url'(UA)` (agent), the old block `tag: { url: … }` (block), and
// `tag: 'url' { … }` (options), whose options sit one key per line. The tag may be quoted or hold spaces; without
// one, a whole-quoted `'tag:url'` carries it (embedded) or the entry is named after the URL's host (host).
export type SubscriptionForm = 'bare' | 'short' | 'agent' | 'block' | 'options';
export type SubscriptionNaming = 'tag' | 'embedded' | 'host';
export type SubscriptionOption = {name: string; value: string};
export const isSubscriptionUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim());
type Range = {from: number; to: number};
type Field = SubscriptionOption & {key: Range; at: Range};
export type SubscriptionText = {
  tag: string;
  url: string;
  form: SubscriptionForm;
  naming: SubscriptionNaming;
  // What honk reads; null when unset, and for an interval or cache honk cannot read either.
  ua: string | null;
  interval: number | null;
  cache: boolean | null;
  // The download route as written: `routing`, `direct` or a group; the old block form may write it as
  // `download_detour`.
  route: string | null;
  // Options as written, values quotes included; the agent form's User-Agent is listed as `ua`.
  options: SubscriptionOption[];
  // The entry's own text, without a comment after it, and where its tag and its URL are written.
  from: number;
  to: number;
  line: number;
  tagAt: Range | null;
  urlAt: Range;
};
type Entry = SubscriptionText & {
  block?: TextBlock;
  container?: TextBlock;
  fields: Field[];
  agentAt?: Range & {quoted: boolean; open: number; close: number};
  comment?: Range;
};
export type SubscriptionChange = {tag?: string; url?: string; ua?: string | null; interval?: number | null; cache?: boolean | null; route?: string | null};

// honk's duration grammar: an integer of seconds, minutes or hours, a bare number of seconds, or milliseconds
// rounded up. Anything else is null: honk would fall back to 0 with a warning, which is not what was written.
export function parseInterval(value: string): number | null {
  const text = value.trim();
  const ms = /^\+?((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)ms$/.exec(text);
  if (ms) return Math.ceil(Number(ms[1]) / 1000);
  const found = /^\+?(\d+)([smh]?)$/.exec(text);
  if (!found) return null;
  return Number(found[1]) * ({s: 1, m: 60, h: 3600}[found[2]] ?? 1);
}
function parseBool(value: string): boolean | null {
  const text = value.toLowerCase();
  return ['true', 'yes', '1', 'on'].includes(text) ? true : ['false', 'no', '0', 'off'].includes(text) ? false : null;
}
export function urlHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// Why a User-Agent cannot be used: past the contract's bound of 256 printable ASCII characters, or, for one written into
// an entry, a value no quote can hold.
export function agentProblem(agent: string, written: boolean): Key | null {
  const value = agent.trim();
  if (!/^[\x20-\x7E]{0,256}$/.test(value)) return 'nodes.agentInvalid';
  return written && !isQuotable(value) ? 'config.unquotable' : null;
}

const raw = (text: string, token: TextToken | undefined) => (token ? text.slice(token.from, token.to) : '');
// A value as honk reads it: a whole-quoted value loses its quotes, anything else is kept as written.
const valueOf = (text: string, parts: TextToken[]) =>
  !parts.length ? '' : parts.length === 1 && parts[0].kind === 'quoted' ? unquote(raw(text, parts[0])) : text.slice(parts[0].from, parts.at(-1)!.to);

type Segment = {parts: TextToken[]; block?: TextBlock; comment?: TextToken};
// honk's entry segments: the tokens of one physical line, carried on to the end of a block that opens there or on
// the next line. Comments separate nothing and are kept aside.
function segments(text: string, container: TextBlock, tokens: TextToken[]): Segment[] {
  const inside = tokens.filter(token => token.from > container.open && token.from < container.close);
  const out: Segment[] = [];
  for (let i = 0; i < inside.length;) {
    const start = inside[i];
    if (start.kind === 'comment') {
      i++;
      continue;
    }
    const parts = [start];
    let block: TextBlock | undefined;
    let j = i + 1;
    while (j < inside.length) {
      const token = inside[j];
      if (token.kind === 'comment') break;
      if (raw(text, token) === '{' && token.depth === container.depth + 1) {
        block = container.children.find(child => child.open === token.from);
        while (j < inside.length && inside[j].from < (block?.to ?? container.close)) j++;
        break;
      }
      if (token.line !== start.line) break;
      parts.push(token);
      j++;
    }
    const end = block?.to ?? parts.at(-1)!.to;
    const next = inside[j];
    const comment = next?.kind === 'comment' && !/\n/.test(text.slice(end, next.from)) ? next : undefined;
    out.push({parts, block, comment});
    i = comment ? j + 1 : j;
  }
  return out;
}

function readFields(text: string, block: TextBlock, tokens: TextToken[]): Field[] | null {
  const fields: Field[] = [];
  for (const {parts, block: nested} of segments(text, block, tokens)) {
    // A block inside an entry is an old wrapper honk still walks; doona does not rewrite around it.
    if (nested) return null;
    // honk passes over a line that is not `key: value`.
    if (parts.length < 2 || raw(text, parts[1]) !== ':' || parts[0].kind === 'symbol') continue;
    const value = parts.slice(2);
    const at = value.length ? {from: value[0].from, to: value.at(-1)!.to} : {from: parts[1].to, to: parts[1].to};
    fields.push({name: unquote(raw(text, parts[0])), value: text.slice(at.from, at.to), key: {from: parts[0].from, to: at.to}, at});
  }
  return fields;
}

// The tag ends at a colon after a quoted head, or at the first colon that does not start `://`.
function splitTag(text: string, parts: TextToken[]) {
  const first = parts[0];
  if (first.kind === 'quoted') {
    if (raw(text, parts[1]) !== ':') return {tag: '', tagAt: null, value: parts};
    return {tag: unquote(raw(text, first)), tagAt: {from: first.from, to: first.to}, value: parts.slice(2)};
  }
  const colon = parts.findIndex(token => raw(text, token) === ':');
  if (colon <= 0 || text.startsWith('//', parts[colon].to)) return {tag: '', tagAt: null, value: parts};
  const tagAt = {from: first.from, to: parts[colon - 1].to};
  return {tag: text.slice(tagAt.from, tagAt.to).trim(), tagAt, value: parts.slice(colon + 1)};
}

// null: not an entry honk reads; 'wrapper': an old wrapper block, whose entries honk reads as its own.
function readEntry(text: string, segment: Segment, tokens: TextToken[]): Entry | null | 'wrapper' {
  const {parts, block, comment} = segment;
  const first = parts[0];
  const base = {from: first.from, to: block?.to ?? parts.at(-1)!.to, line: first.line + 1, comment: comment && {from: comment.from, to: comment.to}};
  // honk keeps the last of a repeated key.
  const lastOf = (fields: Field[], name: string) => fields.filter(field => field.name === name).at(-1);
  const options = (fields: Field[]) => ({
    ua: lastOf(fields, 'ua'),
    interval: lastOf(fields, 'interval'),
    cache: lastOf(fields, 'cache'),
    route: lastOf(fields, 'route'),
    detour: lastOf(fields, 'download_detour')
  });
  const read = (field: Field | undefined) =>
    field
      ? valueOf(
          text,
          tokens.filter(token => token.from >= field.at.from && token.to <= field.at.to)
        )
      : null;
  const split = splitTag(text, parts);
  if (block) {
    const {tag, tagAt, value} = split;
    // The link sits on the header, whole-quoted; any other header before a block is an old wrapper.
    if (!tagAt || value.length > 1 || (value.length === 1 && value[0].kind !== 'quoted')) return 'wrapper';
    const fields = readFields(text, block, tokens);
    if (!fields) return null;
    const found = options(fields);
    const known = {
      ua: read(found.ua),
      interval: found.interval ? parseInterval(read(found.interval)!) : null,
      cache: found.cache ? parseBool(read(found.cache)!) : null,
      route: read(found.route)
    };
    const listed = fields.map(({name, value}) => ({name, value}));
    if (!value.length) {
      const url = lastOf(fields, 'url');
      if (!url) return null;
      return {
        ...base,
        ...known,
        route: known.route ?? read(found.detour),
        tag,
        naming: 'tag',
        form: 'block',
        url: read(url)!,
        options: listed.filter(field => field.name !== 'url'),
        tagAt,
        urlAt: url.at,
        block,
        fields
      };
    }
    const urlAt = {from: value[0].from, to: value[0].to};
    return {...base, ...known, tag, naming: 'tag', form: 'options', url: unquote(raw(text, value[0])), options: listed, tagAt, urlAt, block, fields};
  }
  const {tagAt, value} = split;
  let {tag} = split;
  if (!value.length) return null;
  const head = value[0];
  let url: string;
  let form: SubscriptionForm = 'short';
  let agentAt: Entry['agentAt'];
  let ua: string | null = null;
  if (head.kind !== 'quoted') {
    form = 'bare';
    url = text.slice(head.from, value.at(-1)!.to);
  } else {
    url = unquote(raw(text, head));
    if (value.length > 1) {
      // Only a User-Agent in parentheses may follow a quoted link, and nothing after it.
      const open = value[1];
      const close = value.at(-1)!;
      if (
        raw(text, open) !== '(' ||
        raw(text, close) !== ')' ||
        close.parens !== open.parens + 1 ||
        value.slice(2, -1).some(token => token.parens <= open.parens)
      )
        return null;
      const inner = text.slice(open.to, close.from);
      const trimmed = inner.trim();
      const quoted = value.length === 4 && value[2].kind === 'quoted';
      ua = quoted ? unquote(trimmed) : inner;
      form = 'agent';
      agentAt = {from: open.to, to: close.from, quoted, open: open.from, close: close.to};
    }
  }
  let naming: SubscriptionNaming = 'tag';
  if (!tagAt) {
    const colon = url.indexOf(':');
    if (head.kind === 'quoted' && colon !== -1 && !url.startsWith('://', colon) && url.slice(colon + 1).includes('://')) {
      naming = 'embedded';
      tag = url.slice(0, colon).trim();
      url = url.slice(colon + 1).trim();
    } else {
      naming = 'host';
      tag = (url.includes('://') && urlHost(url)) || '';
    }
  }
  if (!tag || !url) return null;
  const urlAt = {from: head.from, to: form === 'bare' ? value.at(-1)!.to : head.to};
  return {
    ...base,
    tag,
    url,
    form,
    naming,
    ua,
    interval: null,
    cache: null,
    route: null,
    options: ua === null ? [] : [{name: 'ua', value: ua}],
    tagAt,
    urlAt,
    fields: [],
    agentAt
  };
}

function readEntries(text: string): Entry[] {
  const {blocks, tokens} = scanConfig(text);
  const entries: Entry[] = [];
  const visit = (container: TextBlock) => {
    for (const segment of segments(text, container, tokens)) {
      const entry = readEntry(text, segment, tokens);
      if (entry === 'wrapper') visit(segment.block!);
      else if (entry) entries.push({...entry, container});
    }
  };
  for (const section of blocks.filter(block => block.name === 'subscription')) visit(section);
  return entries;
}

// Every entry honk reads as a subscription, in file order.
export function readSubscriptionEntries(text: string): SubscriptionText[] {
  return readEntries(text).map(({block: _block, container: _container, fields: _fields, agentAt: _agentAt, comment: _comment, ...entry}) => entry);
}

// A User-Agent in parentheses is written bare when honk reads it back unchanged, and quoted otherwise.
const bareAgent = (value: string) => /^[^\s()#'"{}]([^()#'"{}]*[^\s()#'"{}])?$/.test(value);
const writeName = (name: string) => (isBareName(name) ? name : quote(name));
const writeTag = (name: string, written?: string) => (/^['"]/.test(written ?? '') || !isBareName(name) ? quote(name) : name);

type Edit = {from: number; to: number; text: string};
const applyEdits = (text: string, edits: Edit[]) =>
  edits.sort((a, b) => b.from - a.from).reduce((out, edit) => out.slice(0, edit.from) + edit.text + out.slice(edit.to), text);
const lineStart = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;
const indentAt = (text: string, at: number) => text.slice(lineStart(text, at), at).match(/^[ \t]*/)![0];
const deeper = (outer: string, inner: string) => (inner.length > outer.length && inner.startsWith(outer) ? inner.slice(outer.length) : '');
// One level of indentation as the file already writes it: from an entry to its options where an entry has them on
// their own lines, else from the section to its entries, else the file's first indented line.
function indentStep(text: string, entries: Entry[], entry: Entry): string {
  for (const other of [entry, ...entries]) {
    const field = other.block && other.block.line !== other.block.endLine ? other.fields[0] : undefined;
    const step = field ? deeper(indentAt(text, other.from), indentAt(text, field.key.from)) : '';
    if (step) return step;
  }
  const step = entry.container ? deeper(indentAt(text, entry.container.open), indentAt(text, entry.from)) : '';
  return step || text.match(/\n([ \t]+)\S/)?.[1] || '    ';
}
// An interval in the largest unit that states it exactly, the integer forms honk reads back.
const writeInterval = (seconds: number) =>
  seconds && seconds % 3600 === 0 ? `${seconds / 3600}h` : seconds && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;

/**
 * Changes one entry where it is written: only the fields given, each in place, so its form, its other options, its
 * comments and every other entry stay as they were. A User-Agent of null removes it; an interval or cache on a
 * one-line entry turns it into `tag: { url: … }`, keeping its name.
 */
export function writeSubscriptionEntry(text: string, tag: string, change: SubscriptionChange): string {
  const entries = readEntries(text);
  const entry = entries.find(entry => entry.tag === tag);
  if (!entry) throw new LocalError('nodes.editMissing');
  const next = {
    tag: change.tag ?? entry.tag,
    url: change.url ?? entry.url,
    ua: change.ua === undefined ? entry.ua : change.ua,
    interval: change.interval === undefined ? entry.interval : change.interval,
    cache: change.cache === undefined ? entry.cache : change.cache,
    route: change.route === undefined ? entry.route : change.route
  };
  if (next.tag !== tag && entries.some(other => other.tag === next.tag)) throw new LocalError('nodes.tagTaken');
  const changed = {
    tag: next.tag !== entry.tag,
    url: next.url !== entry.url,
    ua: next.ua !== entry.ua,
    interval: change.interval !== undefined && next.interval !== entry.interval,
    cache: change.cache !== undefined && next.cache !== entry.cache,
    route: change.route !== undefined && next.route !== entry.route
  };
  if (!Object.values(changed).some(Boolean)) return text;
  const writtenTag = entry.tagAt ? text.slice(entry.tagAt.from, entry.tagAt.to) : undefined;
  const block = entry.block;
  if (!block) {
    // A name derived from the link would follow a new link, so a changed one is written out.
    const named = entry.naming === 'tag' && !changed.tag ? writtenTag! : writeTag(next.tag);
    const header = `${named}: ${quote(next.url)}`;
    if ((changed.interval && next.interval !== null) || (changed.cache && next.cache !== null) || (changed.route && next.route !== null)) {
      const indent = indentAt(text, entry.from);
      const inner = indent + indentStep(text, entries, entry);
      const lines = [`${named}: {${entry.comment ? ' ' + text.slice(entry.comment.from, entry.comment.to) : ''}`, `${inner}url: ${quote(next.url)}`];
      if (next.ua !== null) lines.push(`${inner}ua: ${quote(next.ua)}`);
      if (next.interval !== null) lines.push(`${inner}interval: ${writeInterval(next.interval)}`);
      if (next.cache !== null) lines.push(`${inner}cache: ${next.cache}`);
      if (next.route !== null) lines.push(`${inner}route: ${writeName(next.route)}`);
      lines.push(`${indent}}`);
      return applyEdits(text, [{from: entry.from, to: entry.comment?.to ?? entry.to, text: lines.join('\n')}]);
    }
    const edits: Edit[] = [];
    const agent = next.ua === null ? '' : `(${entry.agentAt?.quoted || !bareAgent(next.ua) ? quote(next.ua) : next.ua})`;
    if (entry.naming !== 'tag' && (changed.tag || changed.url)) {
      edits.push({from: entry.from, to: entry.urlAt.to, text: header});
    } else {
      if (changed.tag) edits.push({...entry.tagAt!, text: writeTag(next.tag, writtenTag)});
      // A bare link would take the parentheses as part of it, so it is quoted once it gets an agent.
      if (changed.url || (entry.form === 'bare' && changed.ua)) edits.push({...entry.urlAt, text: quote(next.url)});
    }
    if (changed.ua) {
      if (entry.agentAt) edits.push({from: entry.agentAt.open, to: entry.agentAt.close, text: agent});
      else edits.push({from: entry.to, to: entry.to, text: agent});
    }
    return applyEdits(text, edits);
  }
  // honk reads one option per line of a block, so a block written on one line is first opened onto several.
  if (block.line === block.endLine && entry.fields.length && (changed.ua || changed.interval || changed.cache || changed.route)) {
    const indent = indentAt(text, entry.from);
    const inner = indent + indentStep(text, entries, entry);
    const body = text.slice(block.open + 1, block.close).trim();
    return writeSubscriptionEntry(applyEdits(text, [{from: block.open, to: block.to, text: `{\n${inner}${body}\n${indent}}`}]), tag, change);
  }
  const edits: Edit[] = [];
  if (changed.tag) edits.push({...entry.tagAt!, text: writeTag(next.tag, writtenTag)});
  if (changed.url) edits.push({...entry.urlAt, text: quote(next.url)});
  const firstField = entry.fields[0];
  const inner = firstField ? indentAt(text, firstField.key.from) : indentAt(text, entry.from) + indentStep(text, entries, entry);
  const closeLine = lineStart(text, block.close);
  const closeOwnLine = /^[ \t]*$/.test(text.slice(closeLine, block.close));
  const removed: Field[] = [];
  let kept = false;
  const set = (name: 'ua' | 'interval' | 'cache' | 'route', value: string | number | boolean | null) => {
    const fields = entry.fields.filter(field => field.name === name);
    // honk refuses an old block that writes both, so a route set there replaces its `download_detour`.
    const detours = name === 'route' && entry.form === 'block' ? entry.fields.filter(field => field.name === 'download_detour') : [];
    removed.push(...detours);
    for (const field of detours) {
      const from = lineStart(text, field.key.from);
      const end = text.indexOf('\n', field.at.to);
      edits.push({from, to: end === -1 ? field.at.to : end + 1, text: ''});
    }
    const last = fields.at(-1);
    if (value === null) {
      removed.push(...fields);
      for (const field of fields) {
        const from = lineStart(text, field.key.from);
        const end = text.indexOf('\n', field.at.to);
        edits.push({from, to: end === -1 ? field.at.to : end + 1, text: ''});
      }
      return;
    }
    kept = true;
    const quoted = !!last && /^['"]/.test(last.value);
    const plain = name === 'interval' ? writeInterval(Number(value)) : String(value);
    const written = name === 'ua' ? quote(plain) : name === 'route' ? writeName(plain) : quoted ? `'${plain}'` : plain;
    if (last) edits.push({...last.at, text: written});
    else if (closeOwnLine) edits.push({from: closeLine, to: closeLine, text: `${inner}${name}: ${written}\n`});
    else edits.push({from: block.close, to: block.close, text: `\n${inner}${name}: ${written}\n${indentAt(text, entry.from)}`});
  };
  if (changed.ua) set('ua', next.ua);
  if (changed.interval) set('interval', next.interval);
  if (changed.cache) set('cache', next.cache);
  if (changed.route) set('route', next.route);
  // `tag: 'url' { }` left with nothing in it goes back to `tag: 'url'`.
  if (entry.form === 'options' && !kept && removed.length === entry.fields.length) {
    const rest = removed.reduce(
      (body, field) => body.replace(text.slice(lineStart(text, field.key.from), text.indexOf('\n', field.at.to) + 1), ''),
      text.slice(block.open + 1, block.close)
    );
    if (!rest.trim()) return applyEdits(text, [...edits.filter(edit => edit.from < block.open), {from: entry.urlAt.to, to: block.to, text: ''}]);
  }
  return applyEdits(text, edits);
}
