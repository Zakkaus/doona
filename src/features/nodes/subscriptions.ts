import {topLevelBlock} from '../config/blocks';

// A subscription's refresh interval lives in the configuration: an entry written as `tag: 'url'` refreshes
// every day, and only the block form `tag: { url: '…' interval: '3600s' }` can say otherwise. doona reads
// the interval off the main source and rewrites one entry into block form when the user changes it.
export const DEFAULT_INTERVAL = 86400;

export type SubscriptionEntry = {
  tag: string;
  // The URL's host, which is how a provider whose nodes carry no tag is matched to its entry.
  host: string | null;
  // Seconds between refreshes; 0 means the subscription is only refreshed by hand.
  interval: number;
  // Line range in the source, inclusive; a scalar entry spans one line.
  from: number;
  to: number;
};

// A quoted string at the start of the text: its unquoted value and where it ends.
function quoted(text: string): {value: string; end: number} | null {
  const quote = text[0];
  if (quote !== "'" && quote !== '"') return null;
  const end = text.indexOf(quote, 1);
  return end === -1 ? null : {value: text.slice(1, end), end: end + 1};
}

// Strip a comment that starts at the beginning of the statement or after whitespace, outside quotes.
function uncomment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return line.slice(0, i);
  }
  return line;
}

// The engine's duration grammar: `30s`, `1m`, `2h`, `500ms` or a bare number of seconds.
export function parseInterval(text: string): number | null {
  const found = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text.trim());
  if (!found) return null;
  const scale: Record<string, number> = {ms: 1 / 1000, s: 1, m: 60, h: 3600};
  return Math.ceil(Number(found[1]) * (scale[found[2] ?? 's'] ?? 1));
}

function host(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// The tag of a scalar entry line, following the engine's first-colon rule: a quoted head followed by a
// colon is an explicit tag, otherwise the text before the first colon unless that colon starts `://`;
// a tagless URL is named after its host.
function scalarTag(code: string): string | null {
  const text = code.trim();
  // A block squeezed onto one line is left alone: its interval is not read and it is not rewritten.
  if (!text || text.includes('{')) return null;
  const head = quoted(text);
  if (head) {
    if (/^\s*:/.test(text.slice(head.end))) return head.value;
    return embeddedTag(head.value);
  }
  return embeddedTag(text);
}

function embeddedTag(text: string): string | null {
  const colon = text.indexOf(':');
  if (colon === -1) return null;
  if (text.startsWith('://', colon)) return host(text);
  return text.slice(0, colon).trim();
}

function keyOf(line: string): {key: string; value: string} | null {
  const found = /^\s*(?:'([^']*)'|"([^"]*)"|([^:\s]+))\s*:\s*(.*)$/.exec(uncomment(line));
  return found ? {key: found[1] ?? found[2] ?? found[3], value: found[4].trim()} : null;
}

const unquote = (text: string) => quoted(text)?.value ?? text;

export function readSubscriptions(text: string): SubscriptionEntry[] {
  const lines = text.split('\n');
  const block = topLevelBlock(lines, 'subscription');
  if (!block) return [];
  const entries: SubscriptionEntry[] = [];
  for (let i = block.open + 1; i < block.close; i++) {
    const code = uncomment(lines[i]);
    const header = /^\s*(?:'([^']*)'|"([^"]*)"|([^:\s]+))\s*:\s*\{\s*$/.exec(code);
    if (header) {
      const tag = header[1] ?? header[2] ?? header[3];
      let depth = 1;
      let interval = DEFAULT_INTERVAL;
      let url: string | null = null;
      let j = i + 1;
      for (; j < block.close && depth > 0; j++) {
        const inner = uncomment(lines[j]);
        depth += (inner.match(/\{/g) ?? []).length - (inner.match(/\}/g) ?? []).length;
        const field = keyOf(inner);
        if (field?.key === 'interval') interval = parseInterval(unquote(field.value)) ?? 0;
        if (field?.key === 'url') url = unquote(field.value);
      }
      entries.push({tag, host: url ? host(url) : null, interval, from: i, to: j - 1});
      i = j - 1;
      continue;
    }
    const tag = scalarTag(code);
    if (tag) entries.push({tag, host: host(scalarParts(code)?.url ?? ''), interval: DEFAULT_INTERVAL, from: i, to: i});
  }
  return entries;
}

// The pieces of a scalar entry that survive the move to block form: the URL and an optional `(UA)` suffix.
function scalarParts(code: string): {url: string; ua: string | null} | null {
  let text = code.trim();
  const head = quoted(text);
  if (head && /^\s*:/.test(text.slice(head.end))) text = text.slice(head.end).replace(/^\s*:\s*/, '');
  else if (!head) {
    const colon = text.indexOf(':');
    if (colon !== -1 && !text.startsWith('://', colon)) text = text.slice(colon + 1).trim();
  }
  const value = quoted(text);
  if (!value) return {url: text, ua: null};
  const suffix = text.slice(value.end).trim();
  const ua = /^\((.*)\)$/.exec(suffix);
  const url = value.value.replace(/^(?!https?:\/\/)[^:]*:/, '');
  return {url, ua: ua ? unquote(ua[1]) : null};
}

const quoteTag = (tag: string) => (/^[\w.-]+$/.test(tag) ? tag : `'${tag}'`);
const quoteValue = (value: string) => `'${value.replace(/'/g, '')}'`;

// The text with `tag`'s entry set to refresh every `seconds` (0 for manual only). A scalar entry becomes a
// block; a block entry keeps its other fields and gets its interval line replaced, added or, at the default,
// removed. Unchanged text when the tag is not there or already reads that interval.
export function writeInterval(text: string, tag: string, seconds: number): string {
  const entry = readSubscriptions(text).find(e => e.tag === tag);
  if (!entry || entry.interval === seconds) return text;
  const lines = text.split('\n');
  const indent = lines[entry.from].match(/^\s*/)?.[0] ?? '  ';
  const inner = indent + (indent.includes('\t') ? '\t' : '  ');
  const intervalLine = `${inner}interval: '${seconds}s'`;
  if (entry.from === entry.to) {
    const parts = scalarParts(uncomment(lines[entry.from]));
    if (!parts) return text;
    const body = [`${indent}${quoteTag(tag)}: {`, `${inner}url: ${quoteValue(parts.url)}`];
    if (parts.ua !== null) body.push(`${inner}ua: ${quoteValue(parts.ua)}`);
    body.push(intervalLine, `${indent}}`);
    lines.splice(entry.from, 1, ...body);
    return lines.join('\n');
  }
  const at = lines.findIndex((line, i) => i > entry.from && i < entry.to && keyOf(line)?.key === 'interval');
  if (at !== -1) lines.splice(at, 1, ...(seconds === DEFAULT_INTERVAL ? [] : [intervalLine]));
  else if (seconds !== DEFAULT_INTERVAL) lines.splice(entry.to, 0, intervalLine);
  return lines.join('\n');
}
