import {describe, expect, it} from 'vitest';
import {flagForName, resolvedFlag} from './countryFlags';

describe('flags from the shared region detector', () => {
  it.each([
    ['JP-01', '🇯🇵'],
    ['Japan Tokyo', '🇯🇵'],
    ['日本高速', '🇯🇵'],
    ['us_02', '🇺🇸'],
    ['USA 03', '🇺🇸'],
    ['United States 04', '🇺🇸'],
    ['美国专线', '🇺🇸'],
    ['美國專線', '🇺🇸'],
    ['CN 01', '🇨🇳'],
    ['中国节点', '🇨🇳'],
    ['中國節點', '🇨🇳'],
    ['Hong Kong China', '🇭🇰'],
    ['香港 01', '🇭🇰'],
    ['HK-03', '🇭🇰'],
    ['Macau', '🇲🇴'],
    ['Macao', '🇲🇴'],
    ['澳门节点', '🇲🇴'],
    ['澳門節點', '🇲🇴'],
    ['Taiwan', '🇹🇼'],
    ['台湾', '🇹🇼'],
    ['台灣', '🇹🇼'],
    ['臺灣', '🇹🇼'],
    ['Singapore 01', '🇸🇬'],
    ['新加坡', '🇸🇬'],
    ['UK London', '🇬🇧'],
    ['Australia', '🇦🇺'],
    ['Indonesia', '🇮🇩'],
    ['印度尼西亞', '🇮🇩'],
    ['India', '🇮🇳'],
    ['FRA 02', '🇩🇪'],
    ['港 01', '🇭🇰'],
    ['AUS', '🇦🇺'],
    ['JPN', '🇯🇵'],
    ['SGP', '🇸🇬'],
    ['CA-01', '🇨🇦'],
    ['ZA 01', '🇿🇦'],
    ['United States of America', '🇺🇸'],
    ['best node in Singapore', '🇸🇬'],
    ['IN-01', '🇮🇳'],
    ['IT Milan', '🇮🇹']
  ])('recognizes %s', (name, expected) => expect(flagForName(name)).toBe(expected));

  it.each([
    'CNN',
    'BUS',
    'USSR',
    'Kraken',
    'Canadair',
    'ChinaTown',
    'begin',
    'origin',
    'my node',
    'it works',
    'no country',
    'node id 42',
    'plain node',
    '高速节点',
    'unknown'
  ])('does not guess from %s', name => expect(flagForName(name)).toBeNull());

  it.each(['🇺🇸 Japan', 'Japan 🇯🇵', '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} UK'])('adds no decoration to an existing flag in %s', name =>
    expect(flagForName(name)).toBeNull()
  );
});

it.each([
  ['Japan', {'node:Japan': 'TW'}, true, '🇹🇼'],
  ['Japan', {}, true, '🇯🇵'],
  ['Japan', {'node:Japan': 'none'}, true, null],
  ['🇯🇵 Japan', {'node:🇯🇵 Japan': 'TW'}, true, null],
  ['Japan', {'node:Japan': 'TW'}, false, null]
] as const)('resolves %s with %j enabled=%s', (name, overrides, enabled, expected) => {
  expect(resolvedFlag(name, overrides, enabled)).toBe(expected);
});
