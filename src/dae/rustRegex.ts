// honk compiles a `regex:` filter with Rust's `regex` crate: Unicode classes, `.` stopping only at `\n`, flags only
// from inline groups. This rewrites that syntax as a JavaScript `v` pattern with the same matches, or returns null
// for syntax the crate rejects or this translator does not cover, so a preview never shows a match honk would not make.

const WORD = String.raw`\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}`;
const perl: Record<string, string> = {
  d: String.raw`\p{Nd}`,
  D: String.raw`\P{Nd}`,
  s: String.raw`\p{White_Space}`,
  S: String.raw`\P{White_Space}`,
  w: `[${WORD}]`,
  W: `[^${WORD}]`
};
const [before, notBefore, after, notAfter] = [`(?<=[${WORD}])`, `(?<![${WORD}])`, `(?=[${WORD}])`, `(?![${WORD}])`];
const boundaries: Record<string, string> = {
  b: `(?:${before}${notAfter}|${notBefore}${after})`,
  B: `(?:${before}${after}|${notBefore}${notAfter})`,
  start: `${notBefore}${after}`,
  end: `${before}${notAfter}`,
  'start-half': notBefore,
  'end-half': notAfter
};
boundaries['<'] = boundaries.start;
boundaries['>'] = boundaries.end;
// The crate's ASCII classes, as `[[:alpha:]]` spells them inside a bracket.
const posix: Record<string, string> = {
  alnum: '0-9A-Za-z',
  alpha: 'A-Za-z',
  ascii: String.raw`\x00-\x7F`,
  blank: String.raw`\t `,
  cntrl: String.raw`\x00-\x1F\x7F`,
  digit: '0-9',
  graph: '!-~',
  lower: 'a-z',
  print: ' -~',
  punct: String.raw`!-\/:-@\[-\`\{-~`,
  space: String.raw`\t\n\v\f\r `,
  upper: 'A-Z',
  word: '0-9A-Za-z_',
  xdigit: '0-9A-Fa-f'
};
const controls: Record<string, number> = {a: 7, f: 12, t: 9, n: 10, r: 13, v: 11};
// The Unicode properties both the crate (Unicode 16 tables) and JavaScript know, matched as loosely as the crate does
// (`\p{greek}`, `\p{Uppercase Letter}`). Surrogates, string properties and anything else stay with the fallback.
const loose = (name: string) => (/^[\w -]*$/.test(name) ? name.replace(/[ _-]/g, '').toLowerCase() : '');
const names = (list: string) => new Map(list.split(/\s+/).map(name => [loose(name), name]));
const binary = names(`ASCII ASCII_Hex_Digit Alphabetic Any Assigned Bidi_Control Bidi_Mirrored Case_Ignorable Cased Changes_When_Casefolded
  Changes_When_Casemapped Changes_When_Lowercased Changes_When_Titlecased Changes_When_Uppercased Dash Default_Ignorable_Code_Point Deprecated Diacritic Emoji
  Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extended_Pictographic Extender Grapheme_Base Grapheme_Extend Hex_Digit
  IDS_Binary_Operator IDS_Trinary_Operator ID_Continue ID_Start Ideographic Join_Control Logical_Order_Exception Lowercase Math Noncharacter_Code_Point
  Pattern_Syntax Pattern_White_Space Quotation_Mark Radical Regional_Indicator Sentence_Terminal Soft_Dotted Terminal_Punctuation Unified_Ideograph Uppercase
  Variation_Selector White_Space XID_Continue XID_Start`);
const categories = names(`C Other Cc Control Cf Format Cn Unassigned Co Private_Use L Letter LC Cased_Letter Ll Lowercase_Letter Lm Modifier_Letter Lo
  Other_Letter Lt Titlecase_Letter Lu Uppercase_Letter M Mark Mc Spacing_Mark Me Enclosing_Mark Mn Nonspacing_Mark N Number Nd Decimal_Number Nl Letter_Number
  No Other_Number P Punctuation Pc Connector_Punctuation Pd Dash_Punctuation Pe Close_Punctuation Pf Final_Punctuation Pi Initial_Punctuation Po
  Other_Punctuation Ps Open_Punctuation S Symbol Sc Currency_Symbol Sk Modifier_Symbol Sm Math_Symbol So Other_Symbol Z Separator Zl Line_Separator Zp
  Paragraph_Separator Zs Space_Separator`);
const scripts = names(`Adlam Ahom Anatolian_Hieroglyphs Arabic Armenian Avestan Balinese Bamum Bassa_Vah Batak Bengali Bhaiksuki Bopomofo Brahmi Braille
  Buginese Buhid Canadian_Aboriginal Carian Caucasian_Albanian Chakma Cham Cherokee Chorasmian Common Coptic Cuneiform Cypriot Cypro_Minoan Cyrillic Deseret
  Devanagari Dives_Akuru Dogra Duployan Egyptian_Hieroglyphs Elbasan Elymaic Ethiopic Garay Georgian Glagolitic Gothic Grantha Greek Gujarati Gunjala_Gondi
  Gurmukhi Gurung_Khema Han Hangul Hanifi_Rohingya Hanunoo Hatran Hebrew Hiragana Imperial_Aramaic Inherited Inscriptional_Pahlavi Inscriptional_Parthian
  Javanese Kaithi Kannada Katakana Kawi Kayah_Li Kharoshthi Khitan_Small_Script Khmer Khojki Khudawadi Kirat_Rai Lao Latin Lepcha Limbu Linear_A Linear_B Lisu
  Lycian Lydian Mahajani Makasar Malayalam Mandaic Manichaean Marchen Masaram_Gondi Medefaidrin Meetei_Mayek Mende_Kikakui Meroitic_Cursive
  Meroitic_Hieroglyphs Miao Modi Mongolian Mro Multani Myanmar Nabataean Nag_Mundari Nandinagari New_Tai_Lue Newa Nko Nushu Nyiakeng_Puachue_Hmong Ogham
  Ol_Chiki Ol_Onal Old_Hungarian Old_Italic Old_North_Arabian Old_Permic Old_Persian Old_Sogdian Old_South_Arabian Old_Turkic Old_Uyghur Oriya Osage Osmanya
  Pahawh_Hmong Palmyrene Pau_Cin_Hau Phags_Pa Phoenician Psalter_Pahlavi Rejang Runic Samaritan Saurashtra Sharada Shavian Siddham SignWriting Sinhala Sogdian
  Sora_Sompeng Soyombo Sundanese Sunuwar Syloti_Nagri Syriac Tagalog Tagbanwa Tai_Le Tai_Tham Tai_Viet Takri Tamil Tangsa Tangut Telugu Thaana Thai Tibetan
  Tifinagh Tirhuta Todhri Toto Tulu_Tigalari Ugaritic Vai Vithkuqi Wancho Warang_Citi Yezidi Yi Zanabazar_Square`);
const keyed: Record<string, [string, Map<string, string>]> = {
  script: ['Script', scripts],
  sc: ['Script', scripts],
  scriptextensions: ['Script_Extensions', scripts],
  scx: ['Script_Extensions', scripts],
  generalcategory: ['General_Category', categories],
  gc: ['General_Category', categories]
};

class Unsupported extends Error {}
function fail(): never {
  throw new Unsupported();
}
const own = <T>(table: Record<string, T>, key: string) => (Object.hasOwn(table, key) ? table[key] : undefined);
// `\pL`, `\p{Greek}`, `\p{sc!=Greek}`: a bare name is a binary property, then a general category, then a script, as in the crate.
function property(body: string, negated: boolean): string {
  const byValue = /^(.*?)(!=|[=:])(.*)$/.exec(body);
  const name = loose(byValue ? byValue[3] : body);
  let query = binary.get(name) ?? categories.get(name) ?? (scripts.has(name) ? `Script=${scripts.get(name)}` : undefined);
  if (byValue) {
    const [key, values] = own(keyed, loose(byValue[1])) ?? fail();
    query = `${key}=${values.get(name) ?? fail()}`;
    if (byValue[2] === '!=') negated = !negated;
  }
  return `\\${negated ? 'P' : 'p'}{${query ?? fail()}}`;
}
function literal(cp: number, inClass: boolean): string {
  const c = String.fromCodePoint(cp);
  if (cp < 0x20 || cp === 0x7f) return `\\u{${cp.toString(16)}}`;
  return (inClass ? /[\\\][{}()/|\-^$.*+?&!#%,:;<=>@`~]/ : /[\\^$.*+?()[\]{}|/]/).test(c) ? `\\${c}` : c;
}

type Piece = {cp: number} | {text: string; assertion?: true};

export function rustRegexToJs(source: string): RegExp | null {
  let rest = source;
  const flags = new Set<string>();
  for (let group = /^\(\?([ims]+)\)/.exec(rest); group; group = /^\(\?([ims]+)\)/.exec(rest)) {
    // The crate refuses a flag repeated within one group.
    if (new Set(group[1]).size !== group[1].length) return null;
    for (const flag of group[1]) flags.add(flag);
    rest = rest.slice(group[0].length);
  }
  const chars = [...rest];
  let i = 0;
  const peek = (offset = 0) => chars[i + offset];
  const take = () => chars[i++] ?? fail();
  const ahead = (text: string) => chars.slice(i, i + text.length).join('') === text;

  const hex = (digits: number) => {
    let text = '';
    if (peek() === '{') {
      i++;
      while (peek() !== '}') text += take();
      i++;
    } else for (let n = 0; n < digits; n++) text += take();
    const cp = /^[0-9a-fA-F]{1,8}$/.test(text) ? parseInt(text, 16) : fail();
    return cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? fail() : cp;
  };
  function escape(inClass: boolean): Piece {
    const c = take();
    const shorthand = own(perl, c);
    if (shorthand) return {text: shorthand};
    if (c === 'p' || c === 'P') {
      if (peek() !== '{') return {text: property(take(), c === 'P')};
      i++;
      let body = '';
      while (peek() !== '}') body += take();
      i++;
      return {text: property(body, c === 'P')};
    }
    const control = own(controls, c);
    if (control !== undefined) return {cp: control};
    if (c === 'x') return {cp: hex(2)};
    if (c === 'u') return {cp: hex(4)};
    if (c === 'U') return {cp: hex(8)};
    if (!inClass) {
      if (c === 'A') return {text: String.raw`(?<![\s\S])`, assertion: true};
      if (c === 'z') return {text: String.raw`(?![\s\S])`, assertion: true};
      if (c === 'b' && peek() === '{') {
        i++;
        let name = '';
        while (peek() !== '}') name += take();
        i++;
        return {text: (name.length > 1 ? own(boundaries, name) : undefined) ?? fail(), assertion: true};
      }
      if (c === 'b' || c === 'B' || c === '<' || c === '>') return {text: boundaries[c], assertion: true};
    }
    // Any other ASCII character but a letter or digit escapes to itself; `<` and `>` are word boundaries.
    return /^[\0-\x7f]$/.test(c) && !/[0-9A-Za-z<>]/.test(c) ? {cp: c.codePointAt(0)!} : fail();
  }

  // One bracket expression, written as a JavaScript `v` class. Union binds tighter than `&&` and `--`, which apply
  // left to right; `~~` has no JavaScript form, and an operator opening the class is left to the fallback.
  function bracket(): string {
    const negated = peek() === '^';
    if (negated) i++;
    const operands: string[][] = [[]];
    const operators: string[] = [];
    let first = true;
    for (;;) {
      if (peek() === undefined) fail();
      if (peek() === ']' && !first) {
        i++;
        break;
      }
      const operator = ['&&', '--', '~~'].find(ahead);
      if (operator) {
        if (first || operator === '~~' || !operands.at(-1)!.length) fail();
        i += 2;
        operators.push(operator);
        operands.push([]);
        continue;
      }
      first = false;
      let piece: Piece;
      if (peek() === '[') {
        i++;
        const named = /^:(\^?)([a-z]+):\]/.exec(chars.slice(i, i + 12).join(''));
        if (named) {
          i += named[0].length;
          piece = {text: `[${named[1]}${own(posix, named[2]) ?? fail()}]`};
        } else piece = {text: bracket()};
      } else if (peek() === '\\') {
        i++;
        piece = escape(true);
      } else piece = {cp: take().codePointAt(0)!};
      const ranged = peek() === '-' && peek(1) !== ']' && peek(1) !== '-';
      if (!('cp' in piece)) {
        if (ranged) fail();
        operands.at(-1)!.push(piece.text);
        continue;
      }
      if (!ranged) {
        operands.at(-1)!.push(literal(piece.cp, true));
        continue;
      }
      i++;
      if (peek() === '[') fail();
      const end = take() === '\\' ? escape(true) : {cp: chars[i - 1].codePointAt(0)!};
      if (!('cp' in end) || end.cp < piece.cp) fail();
      operands.at(-1)!.push(`${literal(piece.cp, true)}-${literal(end.cp, true)}`);
    }
    if (!operands.at(-1)!.length) fail();
    const sets = operands.map(items => `[${items.join('')}]`);
    const combined = operators.reduce((set, operator, n) => `[${set}${operator}${sets[n + 1]}]`, sets[0]);
    return negated ? `[^${combined}]` : combined;
  }

  // A sequence of alternatives up to the closing parenthesis of the current group, or the end at depth 0, and whether
  // it holds a quantifier or an alternation at any depth.
  function alternation(depth: number): {text: string; varies: boolean} {
    const branches: string[] = [];
    let atoms: Array<{text: string; quantified: boolean; varies?: boolean; assertion?: true}> = [];
    let varies = false;
    const quantify = (suffix: string, max: number) => {
      // JavaScript backtracks where the crate stays linear: a quantifier on a quantified atom (`a**`), or one that repeats
      // a group holding a quantifier or an alternation (`(a+)+`, `(a|aa)*`, `(a+){10}`), takes exponential time.
      const last = atoms.at(-1) ?? fail();
      if (last.quantified || (max > 1 && last.varies)) fail();
      const base = last.assertion ? `(?:${last.text})` : last.text;
      const lazy = peek() === '?';
      if (lazy) i++;
      atoms[atoms.length - 1] = {text: `${base}${suffix}${lazy ? '?' : ''}`, quantified: true};
      varies = true;
    };
    for (;;) {
      const c = peek();
      if (c === undefined || c === ')' || c === '|') {
        branches.push(atoms.map(atom => atom.text).join(''));
        varies ||= branches.length > 1;
        atoms = [];
        if (c === undefined) {
          if (depth) fail();
          break;
        }
        i++;
        if (c === ')') {
          if (!depth) fail();
          break;
        }
        continue;
      }
      i++;
      if (c === '*' || c === '+' || c === '?') quantify(c, c === '?' ? 1 : Infinity);
      else if (c === '{') {
        let body = '';
        while (peek() !== '}') body += take();
        i++;
        const count = /^\s*(\d+)\s*(?:(,)\s*(\d*)\s*)?$/.exec(body) ?? fail();
        // The crate rejects counts past its own limits; anything over 1000 is left to the fallback.
        if (Number(count[1]) > 1000 || Number(count[3]) > 1000 || (count[3] && Number(count[3]) < Number(count[1]))) fail();
        quantify(`{${count[1]}${count[2] ?? ''}${count[3] ?? ''}}`, count[2] && !count[3] ? Infinity : Number(count[3] || count[1]));
      } else if (c === '(') {
        // Captures do not change what matches, so a group is written as `(?:…)`; named groups and flag groups are left
        // to the fallback.
        if (peek() === '?') {
          i++;
          if (take() !== ':') fail();
        }
        const group = alternation(depth + 1);
        varies ||= group.varies;
        atoms.push({text: `(?:${group.text})`, quantified: false, varies: group.varies});
      } else if (c === '[') atoms.push({text: bracket(), quantified: false});
      else if (c === '\\') {
        const piece = escape(false);
        atoms.push('cp' in piece ? {text: literal(piece.cp, false), quantified: false} : {...piece, quantified: false});
      } else if (c === '.') atoms.push({text: flags.has('s') ? String.raw`[\s\S]` : String.raw`[^\n]`, quantified: false});
      else if (c === '^' || c === '$') {
        const text = flags.has('m') ? (c === '^' ? String.raw`(?<![^\n])` : String.raw`(?![^\n])`) : c;
        atoms.push({text, quantified: false, assertion: true});
      } else atoms.push({text: literal(c.codePointAt(0)!, false), quantified: false});
    }
    return {text: branches.join('|'), varies};
  }

  try {
    return new RegExp(alternation(0).text, flags.has('i') ? 'iv' : 'v');
  } catch {
    return null;
  }
}
