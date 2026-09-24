// Lightweight highlighting only; the engine remains the authoritative dae parser.
const sections = /^(global|dns|upstream|routing|request|response|subscription|node|group|include|fallback)\b/;

export type DaeToken = 'comment' | 'string' | 'keyword' | 'number' | 'propertyName' | 'variableName' | 'punctuation' | 'operator' | null;
export type DaeState = {afterArrow: boolean};
type Stream = {
  sol: () => boolean;
  eatSpace: () => boolean;
  match: (pattern: string | RegExp) => unknown;
  skipToEnd: () => void;
  next: () => string | void;
  string: string;
  pos: number;
};

export const startDaeState = (): DaeState => ({afterArrow: false});

export function daeToken(stream: Stream, state: DaeState): DaeToken {
  if (stream.sol()) state.afterArrow = false;
  if (stream.eatSpace()) return null;
  if (stream.match('#')) {
    stream.skipToEnd();
    return 'comment';
  }
  if (stream.match(/^'[^']*'/) || stream.match(/^"[^"]*"/)) return 'string';
  if (stream.match('->')) {
    state.afterArrow = true;
    return 'operator';
  }
  if (state.afterArrow && stream.match(/^[\w.-]+/)) {
    state.afterArrow = false;
    return 'keyword';
  }
  if (stream.sol() || stream.string.slice(0, stream.pos).trim() === '') {
    if (stream.match(sections)) return 'keyword';
  }
  if (stream.match(/^\d+(\.\d+)*(\/\d+)?[a-z]*/)) return 'number';
  if (stream.match(/^[\w.-]+(?=\s*\()/)) return 'propertyName';
  if (stream.match(/^[\w.-]+(?=\s*:)/)) return 'variableName';
  // A whole word, so digits inside names such as sg-01 or min_avg10 are not read as numbers.
  if (stream.match(/^[A-Za-z_][\w.-]*/)) return null;
  if (stream.match(/^[{}()&|!,:]/)) return 'punctuation';
  stream.next();
  return null;
}

class LineStream implements Stream {
  pos = 0;
  constructor(readonly string: string) {}
  sol() {
    return this.pos === 0;
  }
  eatSpace() {
    const found = /^\s+/.exec(this.string.slice(this.pos));
    if (!found) return false;
    this.pos += found[0].length;
    return true;
  }
  match(pattern: string | RegExp) {
    const found = typeof pattern === 'string' ? this.string.slice(this.pos).startsWith(pattern) && pattern : pattern.exec(this.string.slice(this.pos));
    if (found) this.pos += typeof found === 'string' ? found.length : found[0].length;
    return found;
  }
  skipToEnd() {
    this.pos = this.string.length;
  }
  next() {
    return this.pos < this.string.length ? this.string[this.pos++] : undefined;
  }
}

export function tokenizeDae(text: string): Array<{text: string; type: DaeToken}> {
  const tokens: Array<{text: string; type: DaeToken}> = [];
  const lines = text.split('\n');
  const state = startDaeState();
  lines.forEach((line, index) => {
    const stream = new LineStream(line);
    while (stream.pos < line.length) {
      const from = stream.pos;
      const type = daeToken(stream, state);
      tokens.push({text: line.slice(from, stream.pos), type});
    }
    if (index < lines.length - 1) tokens.push({text: '\n', type: null});
  });
  return tokens;
}
