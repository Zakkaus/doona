import {LocalError} from '../api/error';

// A value honk reads without quotes.
export const isBareName = (value: string) => /^[\w.-]+$/.test(value);
export function quote(value: string): string {
  // honk skips escaped delimiters but retains the backslash in the value.
  if (value.includes("'") || /[\r\n]|(^|[^\\])(?:\\\\)*\\$/.test(value)) throw new LocalError('config.unquotable');
  return `'${value}'`;
}
export function isQuotable(value: string): boolean {
  try {
    quote(value);
    return true;
  } catch {
    return false;
  }
}
export type TextToken = {from: number; to: number; line: number; kind: 'text' | 'quoted' | 'comment' | 'symbol'; depth: number; parens: number};
export type TextBlock = {
  name: string;
  from: number;
  open: number;
  close: number;
  to: number;
  line: number;
  endLine: number;
  depth: number;
  children: TextBlock[];
};
export type TextField = {name: string; from: number; to: number; valueFrom: number; valueTo: number; value: string};

// Offsets always address the original text; quotes and comments never contribute structural braces.
export function scanConfig(text: string) {
  const tokens: TextToken[] = [];
  const blocks: TextBlock[] = [];
  const stack: TextBlock[] = [];
  let line = 0;
  let parens = 0;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (c === '\n') line++;
      i++;
      continue;
    }
    const from = i;
    const startLine = line;
    let kind: TextToken['kind'] = 'text';
    if (c === '#') {
      kind = 'comment';
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === "'" || c === '"') {
      kind = 'quoted';
      i++;
      while (i < text.length) {
        const next = text[i++];
        if (next === '\n') line++;
        if (next === '\\' && i < text.length) {
          if (text[i] === '\n') line++;
          i++;
        } else if (next === c) break;
      }
    } else if ('{}:(),'.includes(c)) {
      kind = 'symbol';
      i++;
    } else if (c === '-' && text[i + 1] === '>') {
      // The routing arrow is its own token even when written flush against its neighbours, as in `dip(x)->direct`.
      i += 2;
    } else {
      while (i < text.length && !/[\s{}:(),'"]/.test(text[i]) && !(text[i] === '-' && text[i + 1] === '>')) i++;
    }
    const token = {from, to: i, line: startLine, kind, depth: stack.length, parens};
    if (kind === 'symbol' && c === '{') {
      let headIndex = tokens.length - 1;
      while (headIndex >= 0 && (tokens[headIndex].kind === 'comment' || text.slice(tokens[headIndex].from, tokens[headIndex].to) === ':')) headIndex--;
      const head = tokens[headIndex];
      const block: TextBlock = {
        name: head ? unquote(text.slice(head.from, head.to)) : '',
        from: head?.from ?? from,
        open: from,
        close: text.length,
        to: text.length,
        line: head?.line ?? line,
        endLine: line,
        depth: stack.length,
        children: []
      };
      (stack.at(-1)?.children ?? blocks).push(block);
      stack.push(block);
    } else if (kind === 'symbol' && c === '}') {
      const block = stack.pop();
      if (block) {
        block.close = from;
        block.to = i;
        block.endLine = line;
      }
    } else if (kind === 'symbol' && c === '(') parens++;
    else if (kind === 'symbol' && c === ')') parens = Math.max(0, parens - 1);
    tokens.push(token);
  }
  return {blocks, tokens};
}

/**
 * Whether typed text can be written as one field value or rule without changing the file's structure: a single
 * line with balanced parentheses and no comment or brace outside quotes. `domain(a) # x` would comment out the
 * outbound written after it; a brace would open or close a section.
 */
export function isFragment(text: string): boolean {
  if (/[\r\n]/.test(text)) return false;
  let depth = 0;
  for (const token of scanConfig(text).tokens) {
    if (token.kind === 'comment') return false;
    if (token.kind === 'quoted') continue;
    const raw = text.slice(token.from, token.to);
    if (raw.includes('{') || raw.includes('}')) return false;
    if (raw === '(') depth++;
    if (raw === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

export const unquote = (text: string) => (/^['"]/.test(text) ? text.slice(1, -1) : text);
export function uncomment(text: string): string {
  const comments = scanConfig(text).tokens.filter(token => token.kind === 'comment');
  for (const token of comments.reverse()) text = text.slice(0, token.from) + text.slice(token.to);
  return text;
}

export function blockFields(text: string, block: TextBlock, tokens: TextToken[]): TextField[] {
  const fields: TextField[] = [];
  let field: TextField | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.from <= block.open || token.from >= block.close) continue;
    const raw = text.slice(token.from, token.to);
    if (token.kind === 'comment' || (field && token.parens === 0 && text.slice(field.valueTo, token.from).includes('\n'))) field = undefined;
    if (token.depth !== block.depth + 1 || token.kind === 'comment') continue;
    const next = tokens[i + 1];
    if (token.parens === 0 && (token.kind === 'text' || token.kind === 'quoted') && next && text.slice(next.from, next.to) === ':') {
      field = {name: unquote(raw), from: token.from, to: next.to, valueFrom: next.to, valueTo: next.to, value: ''};
      fields.push(field);
      i++;
    } else if (field) {
      field.to = token.to;
      field.valueTo = token.to;
    }
  }
  for (const field of fields) field.value = text.slice(field.valueFrom, field.valueTo).trim();
  return fields;
}

export function blockBody(text: string, block: TextBlock): string[] {
  const body = text.slice(block.open + 1, block.close);
  return block.line === block.endLine
    ? [body]
    : body
        .replace(/^[^\S\n]*\n/, '')
        .replace(/\n[^\S\n]*$/, '')
        .split('\n');
}

export function blockEntries(text: string, block: TextBlock): Array<{from: number; to: number; block?: TextBlock}> {
  const entries: Array<{from: number; to: number; block?: TextBlock}> = [];
  let from = block.open + 1;
  if (/^[^\S\n]*\n/.test(text.slice(from, block.close))) from = text.indexOf('\n', from) + 1;
  const lastLine = text.lastIndexOf('\n', block.close - 1) + 1;
  const end = lastLine > from && /^[ \t]*$/.test(text.slice(lastLine, block.close)) ? lastLine - 1 : block.close;
  while (from <= end) {
    const newline = text.indexOf('\n', from);
    let to = newline === -1 ? end : Math.min(newline, end);
    const child = block.children.find(child => child.from >= from && child.from <= to);
    if (child) {
      const after = text.indexOf('\n', child.to);
      to = after === -1 ? end : Math.min(after, end);
    }
    entries.push({from, to, block: child});
    from = to + 1;
  }
  return entries;
}
