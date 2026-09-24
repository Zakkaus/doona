import {expect, it} from 'vitest';
import {tokenizeDae} from './daeTokens';

it('classifies dae syntax and preserves every character', () => {
  const source = 'routing {\n  filter: name(\'hk\', "sg", 10ms) # note\n  l4proto(tcp) -> proxy\n}\n';
  const tokens = tokenizeDae(source);
  expect(tokens.map(token => token.text).join('')).toBe(source);
  for (const [text, type] of [
    ['routing', 'keyword'],
    ['filter', 'variableName'],
    ['name', 'propertyName'],
    ["'hk'", 'string'],
    ['"sg"', 'string'],
    ['10ms', 'number'],
    ['# note', 'comment'],
    ['->', 'operator'],
    ['proxy', 'keyword'],
    ['{', 'punctuation']
  ] as const)
    expect(tokens).toContainEqual({text, type});
  expect(tokenizeDae('  dns {\n  # note\n  request {\n')).toContainEqual({text: 'request', type: 'keyword'});
});

it('keeps digits inside names out of the number class', () => {
  const tokens = tokenizeDae('  filter: name(sg-01, hk-02)\n  policy: min_avg10\n  dport(443) && dip(10.0.0.0/24)\n');
  expect(tokens.filter(token => token.type === 'number').map(token => token.text)).toEqual(['443', '10.0.0.0/24']);
  expect(tokens).toContainEqual({text: 'sg-01', type: null});
  expect(tokens).toContainEqual({text: 'min_avg10', type: null});
});
