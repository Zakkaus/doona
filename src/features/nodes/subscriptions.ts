import {blockFields, quote, scanConfig, uncomment, unquote, type TextBlock, type TextField} from '../../dae/text';

export type SubscriptionEntry = {tag: string; host: string | null; interval: number | null; from: number; to: number};
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
  if (suffix && ua === null) return null;
  return tag ? {tag, url, ua} : null;
}

function subscriptionRanges(text: string) {
  const {blocks, tokens} = scanConfig(text);
  const entries: SubscriptionRange[] = [];
  // Entries are cut at token boundaries, not lines: two scalars may share a line.
  for (const section of blocks.filter(block => block.name === 'subscription')) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.from <= section.open || token.from >= section.close || token.depth !== section.depth + 1 || token.kind === 'comment') continue;
      const lineStart = text.lastIndexOf('\n', token.from - 1) + 1;
      const from = /^[ \t]*$/.test(text.slice(lineStart, token.from)) ? lineStart : token.from;
      const block = section.children.find(block => block.from === token.from);
      if (block) {
        while (tokens[i + 1]?.from < block.to) i++;
        if (block.line === block.endLine) continue;
        const fields = blockFields(text, block, tokens);
        const url = fields.find(field => field.name === 'url');
        const interval = fields.find(field => field.name === 'interval');
        entries.push({
          from,
          to: block.to,
          block,
          tag: block.name,
          host: url ? host(unquote(url.value)) : null,
          interval: interval ? parseInterval(unquote(interval.value)) : null,
          fields,
          parts: null
        });
        continue;
      }
      const colon = tokens[i + 1];
      if (colon && text.slice(colon.from, colon.to) === ':' && !text.slice(colon.to).startsWith('//')) i += 2;
      const value = tokens[i];
      if (!value || value.from >= section.close) break;
      if (value.kind !== 'quoted') {
        while (tokens[i + 1]?.from === tokens[i].to && !/[(){}]/.test(text.slice(tokens[i + 1].from, tokens[i + 1].to))) i++;
      }
      if (text[tokens[i + 1]?.from] === '(') {
        i++;
        while (tokens[i + 1] && !(text[tokens[i].from] === ')' && tokens[i].parens === 1)) i++;
      }
      let to = tokens[i].to;
      if (tokens[i + 1]?.kind === 'comment' && tokens[i + 1].line === tokens[i].line) to = tokens[++i].to;
      const parts = scalarParts(text.slice(from, to));
      if (parts) entries.push({from, to, tag: parts.tag, host: host(parts.url), interval: null, fields: [], parts});
    }
  }
  return entries;
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
  if (field) return text.slice(0, field.valueFrom) + ` '${seconds}s'` + text.slice(field.valueTo);
  if (!entry.block) return text;
  const at = text.lastIndexOf('\n', entry.block.close - 1) + 1;
  return text.slice(0, at) + `${inner}interval: '${seconds}s'\n` + text.slice(at);
}
