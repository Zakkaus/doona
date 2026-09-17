import {StreamLanguage} from '@codemirror/language';

// A stream tokenizer for dae text: comments, section keywords, quoted strings, rule arrows and the outbound
// after them, numbers. Enough for reading; the engine does the real parsing.
const sections = /^(global|dns|upstream|routing|request|response|subscription|node|group|include|fallback)\b/;
export const dae = StreamLanguage.define<{afterArrow: boolean}>({
  name: 'dae',
  languageData: {commentTokens: {line: '#'}, closeBrackets: {brackets: ['(', '{', "'", '"']}},
  startState: () => ({afterArrow: false}),
  token(stream, state) {
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
    if (stream.match(/^\d+(\.\d+)?[a-z]*/)) return 'number';
    if (stream.match(/^[\w.-]+(?=\s*\()/)) return 'propertyName';
    if (stream.match(/^[\w.-]+(?=\s*:)/)) return 'variableName';
    if (stream.match(/^[{}()&|!,:]/)) return 'punctuation';
    stream.next();
    return null;
  }
});
