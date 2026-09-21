import {blockEntries, blockFields, quote, scanConfig, uncomment, unquote, type TextBlock, type TextField} from '../config/blocks';

export const DEFAULT_INTERVAL = 86400;
export type SubscriptionEntry = {tag: string; host: string | null; interval: number; from: number; to: number};
type ScalarSubscription = {tag: string; url: string; ua: string | null};
type SubscriptionRange = SubscriptionEntry & {block?: TextBlock; fields: TextField[]; parts: ScalarSubscription | null};

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

function scalarParts(code: string) {
  const text = uncomment(code).trim();
  const {tokens} = scanConfig(text);
  const head = tokens[0];
  if (!head) return null;
  const raw = text.slice(head.from, head.to);
  const colon = tokens[1];
  const tagged = colon && text.slice(colon.from, colon.to) === ':' && !text.slice(colon.to).startsWith('//');
  const valueFrom = tagged ? colon.to : 0;
  const valueToken = tokens.find(token => token.from >= valueFrom);
  if (!valueToken) return null;
  const quoted = valueToken.kind === 'quoted';
  let url = quoted ? unquote(text.slice(valueToken.from, valueToken.to)) : text.slice(valueFrom).trim();
  let tag = tagged ? unquote(raw) : null;
  if (!tag) {
    const split = url.indexOf(':');
    if (split !== -1 && !url.startsWith('://', split)) {
      tag = url.slice(0, split).trim();
      url = url.slice(split + 1);
    } else tag = host(url);
  }
  const suffix = quoted ? text.slice(valueToken.to).trim() : '';
  const ua = suffix.startsWith('(') && suffix.endsWith(')') ? unquote(suffix.slice(1, -1)) : null;
  return tag ? {tag, url, ua} : null;
}

function subscriptionRanges(text: string) {
  const {blocks, tokens} = scanConfig(text);
  return blocks
    .filter(block => block.name === 'subscription')
    .flatMap(section =>
      blockEntries(text, section).flatMap<SubscriptionRange>(range => {
        const code = text.slice(range.from, range.to);
        if (range.block) {
          const block = range.block;
          if (block.line === block.endLine) return [];
          const fields = blockFields(text, block, tokens);
          const url = fields.find(field => field.name === 'url');
          const interval = fields.find(field => field.name === 'interval');
          return [
            {
              ...range,
              tag: block.name,
              host: url ? host(unquote(url.value)) : null,
              interval: interval ? (parseInterval(unquote(interval.value)) ?? 0) : DEFAULT_INTERVAL,
              fields,
              parts: null
            }
          ];
        }
        const parts = scalarParts(code);
        return parts ? [{...range, tag: parts.tag, host: host(parts.url), interval: DEFAULT_INTERVAL, fields: [], parts}] : [];
      })
    );
}

export function readSubscriptions(text: string): SubscriptionEntry[] {
  let offset = 0;
  let line = 0;
  return subscriptionRanges(text).map(entry => {
    while (offset < entry.from) if (text[offset++] === '\n') line++;
    const from = line;
    while (offset < entry.to) if (text[offset++] === '\n') line++;
    return {tag: entry.tag, host: entry.host, interval: entry.interval, from, to: line};
  });
}

export function writeInterval(text: string, tag: string, seconds: number): string {
  const entry = subscriptionRanges(text).find(entry => entry.tag === tag);
  if (!entry || entry.interval === seconds) return text;
  const indent = text.slice(entry.from, entry.to).match(/^[ \t]*/)?.[0] ?? '  ';
  const inner = indent + (indent.includes('\t') ? '\t' : '  ');
  if (entry.parts) {
    const body = [`${indent}${/^[\w.-]+$/.test(tag) ? tag : quote(tag)}: {`, `${inner}url: ${quote(entry.parts.url)}`];
    if (entry.parts.ua !== null) body.push(`${inner}ua: ${quote(entry.parts.ua)}`);
    body.push(`${inner}interval: '${seconds}s'`, `${indent}}`);
    return text.slice(0, entry.from) + body.join('\n') + text.slice(entry.to);
  }
  const field = entry.fields.find(field => field.name === 'interval');
  if (field) {
    if (seconds !== DEFAULT_INTERVAL) return text.slice(0, field.valueFrom) + ` '${seconds}s'` + text.slice(field.valueTo);
    const start = text.lastIndexOf('\n', field.from - 1) + 1;
    const end = text.indexOf('\n', field.to);
    const ownLine = /^[ \t]*$/.test(text.slice(start, field.from)) && end !== -1 && /^[ \t]*$/.test(text.slice(field.to, end));
    return text.slice(0, ownLine ? start : field.from) + text.slice(ownLine ? end + 1 : field.to);
  }
  if (seconds === DEFAULT_INTERVAL || !entry.block) return text;
  const at = text.lastIndexOf('\n', entry.block.close - 1) + 1;
  return text.slice(0, at) + `${inner}interval: '${seconds}s'\n` + text.slice(at);
}
