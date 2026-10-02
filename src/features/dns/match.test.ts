import {expect, it} from 'vitest';
import {dnsMatcher, dnsPattern, type MatchKind} from './match';

const names = ['example.com.', 'www.Example.com.', 'notexample.com.', 'example.com.cn.', 'a.b.org.', 'completely.org.'];
const matching = (kind: MatchKind, text: string) => {
  const matcher = dnsMatcher(kind, text);
  return matcher && names.filter(matcher);
};

it.each<[MatchKind, string, string[]]>([
  ['full', 'EXAMPLE.com', ['example.com.']],
  ['full', 'example.com.', ['example.com.']],
  ['suffix', 'example.com', ['example.com.', 'www.Example.com.']],
  ['suffix', '.example.com', ['www.Example.com.']],
  ['suffix', 'example.com.', ['example.com.', 'www.Example.com.']],
  ['keyword', 'example', ['example.com.', 'www.Example.com.', 'notexample.com.', 'example.com.cn.']],
  ['keyword', 'com.', ['example.com.cn.']],
  ['keyword', 'COM.CN', ['example.com.cn.']],
  ['regex', '^(www\\.)?example\\.com$', ['example.com.', 'www.Example.com.']],
  ['regex', '^WWW\\.EXAMPLE', ['www.Example.com.']],
  ['regex', '\\.org$', ['a.b.org.', 'completely.org.']],
  ['full', 'missing.test', []],
  ['suffix', '', names],
  ['regex', '', names]
])('matches %s %j', (kind, text, expected) => {
  expect(matching(kind, text)).toEqual(expected);
});

it.each<[MatchKind, string, {kind: MatchKind; text: string}]>([
  ['full', '*.example.com', {kind: 'suffix', text: 'example.com'}],
  ['regex', '*.example.com', {kind: 'suffix', text: 'example.com'}],
  ['keyword', 'example', {kind: 'keyword', text: 'example'}],
  ['suffix', '*', {kind: 'suffix', text: '*'}]
])('reads the shorthand of %s %j', (kind, text, expected) => {
  expect(dnsPattern(kind, text)).toEqual(expected);
});

it.each<[MatchKind, string]>([
  ['regex', '('],
  ['regex', '[a-'],
  ['regex', '*a'],
  ['regex', '\\p{Nope}'],
  ['full', '.'],
  ['full', ' . '],
  ['suffix', '.'],
  ['suffix', '..']
])('refuses %s %j, which is not usable', (kind, text) => {
  expect(dnsMatcher(kind, text)).toBeNull();
});
