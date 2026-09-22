import {describe, expect, it} from 'vitest';
import {blockFields, scanConfig, uncomment, isFragment} from './text';
import {groupNames} from '../features/config/names';

it('keeps source ranges through quoted braces, escaped quotes, comments and repeated inline sections', () => {
  const text = `# group { fake {} }
node { value: 'https://example.org/{#}' }
group { 'proxy.eu' { filter: name(regex: 'a{2}#b') policy: fixed(2) } } # }
group {
  "quoted group" { filter: name('a\\\"}b') policy: random } # {
}
dns { routing { request { fallback: direct } } }
`;
  const {blocks, tokens} = scanConfig(text);
  expect(blocks.map(block => block.name)).toEqual(['node', 'group', 'group', 'dns']);
  expect(text.slice(blocks[1].from, blocks[1].to)).toBe("group { 'proxy.eu' { filter: name(regex: 'a{2}#b') policy: fixed(2) } }");
  expect(blockFields(text, blocks[1].children[0], tokens).map(field => [field.name, field.value])).toEqual([
    ['filter', "name(regex: 'a{2}#b')"],
    ['policy', 'fixed(2)']
  ]);
  expect(groupNames(text)).toEqual(['proxy.eu', 'quoted group']);
  expect(blocks[3].children[0].children[0].name).toBe('request');
});

it('strips only comments, not quoted hashes or URL fragments', () => {
  expect(uncomment(`url: 'https://example.org/#{}' # }`)).toBe(`url: 'https://example.org/#{}' `);
  expect(uncomment('url: https://example.org/#fragment # {')).toBe('url: https://example.org/#fragment ');
});

it('keeps comments adjacent to braces out of section headers and depth', () => {
  const text = 'group # { ignored\n{ a { policy: random } }# }\nrouting { fallback: a }\n';
  expect(scanConfig(text).blocks.map(block => block.name)).toEqual(['group', 'routing']);
  expect(groupNames(text)).toEqual(['a']);
});

describe('isFragment', () => {
  it('accepts one balanced line and rejects text that would escape it', () => {
    for (const ok of ['domain(geosite: cn)', 'name(\'a # b\', "c}")', 'min_moving_avg', "!name('direct')"]) expect(isFragment(ok)).toBe(true);
    for (const bad of ['domain(a) # x', 'domain(a', 'domain(a))', 'a } routing {', 'domain(a)\nb', 'name({a})']) expect(isFragment(bad)).toBe(false);
  });
});
