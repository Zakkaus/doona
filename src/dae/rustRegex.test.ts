import {describe, expect, it} from 'vitest';
import {rustRegexToJs} from './rustRegex';

const r = String.raw;
// [pattern, input, whether Rust's `regex` crate matches, or null when the translator declines the pattern]. Each
// matching row was checked against `regex` 1.13.1 `Regex::new(p)?.is_match(s)`; null rows are patterns the crate
// rejects, or (marked) ones it accepts but this translator leaves to the raw-text fallback.
const rows: Array<[string, string, boolean | null]> = [
  // Escaped ASCII punctuation is the literal character.
  [r`^HK\-01$`, 'HK-01', true],
  [r`\_\#\ \&`, '_# &', true],
  ['a\\\tb', 'a\tb', true],
  [r`\"\'\/\!\,\;\=\%\~\@\:`, `"'/!,;=%~@:`, true],
  [r`\K`, 'K', null],
  [r`\0`, '\0', null],
  [r`\e`, '\x1b', null],
  // Hex and control escapes.
  [r`\x{4e00}`, '一', true],
  [r`^\x41B\u{43}\U00000044$`, 'ABCD', true],
  [r`^\x{1F600}$`, '😀', true],
  [r`\a\v\f\t\n\r`, '\x07\v\f\t\n\r', true],
  [r`\x{110000}`, 'a', null],
  [r`\x{D800}`, 'a', null],
  [r`\x4`, 'a', null],
  // Unicode classes: one letter, general category, script, by value, negated.
  [r`\pL`, 'é', true],
  [r`\p{L}`, '1', false],
  [r`\p{Han}`, '中', true],
  [r`\p{Greek}`, '͂', false],
  [r`\p{scx=Greek}`, '͂', true],
  [r`\p{sc:Han}`, '中', true],
  [r`\p{sc!=Han}`, '中', false],
  [r`\p{greek}`, 'α', true],
  [r`\p{Uppercase Letter}`, 'A', true],
  [r`\PL`, '5', true],
  [r`\P{Han}`, '中', false],
  [r`\p{^Han}`, 'a', null],
  [r`\p{L&}`, 'a', null],
  [r`\p{gc=Lu}`, 'A', true],
  [r`\p{General Category = Uppercase Letter}`, 'a', false],
  [r`\p{Script_Extensions=Greek}`, '͂', true],
  [r`\p{Emoji}`, '😀', true],
  [r`\p{ASCII}`, 'é', false],
  [r`\p{Assigned}`, 'a', true],
  [r`\P{Cs}`, 'a', null],
  [r`\p{Surrogate}`, 'a', null],
  [r`\p{Changes_When_NFKC_Casefolded}`, 'A', null],
  [r`\p{RGI_Emoji}`, '😀', null],
  [r`\p{Age=3.0}`, 'a', null], // accepted by the crate; JavaScript has no Age
  [r`\p{gc=Any}`, 'a', null], // accepted by the crate; Any is mapped only as a bare name
  [r`\p{Katakana}`, 'カ', null],
  [r`\p{Hani}`, '中', null], // accepted by the crate; only full script names are mapped
  // Perl classes follow Unicode, as the crate does by default.
  [r`^\w+$`, '香港節點', true],
  [r`\w`, '́', true],
  [r`\w`, '‍', true],
  [r`\W`, '-', true],
  [r`\d`, '٣', true],
  [r`\D`, '٣', false],
  [r`\s`, '　', true],
  [r`\S`, ' ', false],
  // Word boundaries are built on the Unicode word class.
  [r`\bfoo\b`, 'a foo.', true],
  [r`\bfoo\b`, '中foo', false],
  [r`a\Bb`, 'ab', true],
  [r`\<a`, 'a', true],
  [r`\<a`, 'ba', false],
  [r`a\>`, 'ab', false],
  [r`\b{start}a`, 'a', true],
  [r`a\b{end}`, 'a-', true],
  [r`x\b{start-half}`, 'x', false],
  [r`a\b{end-half}`, 'a-', true],
  [r`\b{foo}`, 'a', null],
  // ASCII classes inside a bracket.
  [r`^[[:alpha:]]+$`, 'abc', true],
  [r`[[:alpha:]]`, 'é', false],
  [r`[[:^alpha:]]`, '1', true],
  [r`[[:punct:]]`, '~', true],
  [r`[[:word:]]`, '_', true],
  [r`(?i)[[:upper:]]`, 'a', true],
  [r`[:alpha:]`, ':', true],
  [r`[[:foo:]]`, 'f', null], // accepted by the crate as a nested class
  // Counted repetition.
  [r`^a{2}$`, 'aa', true],
  [r`^a{ 2 }$`, 'aa', true],
  [r`^a{2,}$`, 'a', false],
  [r`^a{1000}$`, 'a', false],
  [r`^a{0,1000}$`, 'a', true],
  [r`a{1001}`, 'a', null], // accepted by the crate; counts over 1000 are not mapped
  [r`a{0,5000000}`, 'a', null],
  [r`a{0,4294967296}`, 'a', null],
  [r`a{,3}`, 'aa', null],
  [r`a{,}`, 'a', null],
  [r`a{2,1}`, 'a', null],
  [r`a{x}`, 'a{x}', null],
  [r`a{`, 'a{', null],
  [r`{`, '{', null],
  [r`a**`, 'aa', null], // accepted by the crate; a quantified atom is not quantified again
  [r`^a**b$`, 'a'.repeat(32), null], // accepted by the crate
  [r`a{2}{3}`, 'aaaaaa', null], // accepted by the crate
  // A group that holds a quantifier or an alternation is not repeated, as JavaScript would backtrack exponentially.
  [r`^(a*)*b$`, 'a'.repeat(26), null], // accepted by the crate
  [r`^(a+)+$`, 'a'.repeat(26), null], // accepted by the crate
  [r`(ab+)*`, 'abb', null], // accepted by the crate
  [r`^(a|aa)*$`, 'aaa', null], // accepted by the crate
  [r`^(a+){10}$`, 'a'.repeat(10), null], // accepted by the crate
  [r`(ab+)?`, 'abb', true],
  [r`(ab){2,3}`, 'aba', false],
  [r`^(ab){2,3}$`, 'ababab', true],
  [r`^*a`, 'a', true],
  [r`^a+?b$`, 'aab', true],
  // A bare `]` or `}` outside a class is a literal.
  [r`x]`, 'x]', true],
  [r`a}`, 'a}', true],
  // Brackets: literal `]` and `-`, ranges, nesting, set operations.
  [r`[]a]`, ']', true],
  [r`[^]a]`, 'b', true],
  [r`[a-]`, '-', true],
  [r`[a-b-c]`, '-', true],
  [r`[-a]`, '-', true],
  [r`[-a]`, 'b', false],
  [r`[\--\/]`, '.', true],
  [r`[\x41-\x{43}]`, 'B', true],
  [r`[😀-😂]`, '😁', true],
  [r`[a&b~c]`, '~', true],
  [r`[[a][b]]`, 'b', true],
  [r`[a[^b]]`, 'c', true],
  [r`^[\p{Greek}&&\pL]+$`, 'Я', false],
  [r`^[\p{Greek}&&\pL]+$`, 'αβ', true],
  [r`[ab[cd]&&[c]]`, 'c', true],
  [r`[\w--\d]`, '5', false],
  [r`[^\w--\d]`, '5', true],
  [r`[\d--[0-4]]`, '7', true],
  [r`[a~~b]`, 'a', null], // accepted by the crate; JavaScript has no symmetric difference
  [r`[&&a]`, 'a', null], // accepted by the crate; an operator opening a class is not mapped
  [r`[~~a]`, '~', null], // accepted by the crate
  [r`[--a]`, '0', null], // accepted by the crate
  [r`[^&&a]`, 'b', null], // accepted by the crate
  [r`[z-a]`, 'a', null],
  [r`[a-\d]`, 'a', null],
  [r`[\w-.]`, '-', null],
  [r`[\b]`, '\b', null],
  [r`[]`, 'a', null],
  // `.` stops only at `\n`; `^` and `$` see only `\n` as a line end.
  [r`a.b`, 'a\rb', true],
  [r`a.b`, 'a\nb', false],
  [r`^.$`, '😀', true],
  [r`a$`, 'a\n', false],
  [r`\Aa\z`, 'a', true],
  [r`\Z`, 'a', null],
  // Leading inline flags.
  [r`(?i)^hk`, 'HK 01', true],
  [r`(?i)Σ`, 'ς', true],
  [r`(?i)\p{Lu}`, 'a', true],
  [r`(?s)a.b`, 'a\nb', true],
  [r`(?i)(?s)A.b`, 'a\nb', true],
  [r`(?m)^b`, 'a\nb', true],
  [r`(?m)^b`, 'a\rb', false],
  [r`(?m)a$`, 'a\r\nb', false],
  [r`(?ii)a`, 'a', null],
  [r`(?x)a b`, 'ab', null], // accepted by the crate; only i, s and m are mapped
  [r`(?U)a+`, 'aa', null], // accepted by the crate
  [r`a(?i)b`, 'aB', null], // accepted by the crate; mid-pattern flags are not mapped
  [r`(?i:a)b`, 'Ab', null], // accepted by the crate
  // Groups.
  [r`^(a|b)c$`, 'bc', true],
  [r`(?:a)(?:)`, 'a', true],
  [r`(?P<n>a)(?<m>b)`, 'ab', null], // accepted by the crate; named groups are not mapped
  [r`(?P<x>a)(?<x>b)`, 'ab', null],
  [r`(?P<1a>x)`, 'x', null],
  [r`(|a)`, 'a', true],
  [r`(a`, 'a', null],
  [r`a)`, 'a', null],
  [r`(?=a)`, 'a', null],
  [r`a\Kb`, 'ab', null]
];

describe('rustRegexToJs', () => {
  it.each(rows)('%s on %j', (pattern, input, expected) => {
    const compiled = rustRegexToJs(pattern);
    expect(compiled && compiled.test(input)).toBe(expected);
  });
});
