import {describe, expect, it} from 'vitest';
import type {ConfigSource, DnsRoutingRule, RoutingRule} from '../../api/model';
import {geodataPreset} from '../../dae/geodata';
import {serviceRules} from './service';

function source(content: string, id = 'main'): ConfigSource {
  return {
    id,
    path: `${id}.dae`,
    kind: 'main',
    writable: true,
    loaded_at: '',
    content,
    content_sha256: '',
    bytes: content.length,
    line_count: content.split('\n').length
  };
}
function rule(expression: string, line: number, kind: RoutingRule['kind'] = 'rule', sourceId = 'main'): RoutingRule {
  return {
    rule_id: `${sourceId}:${line}`,
    index: line - 1,
    kind,
    expression,
    outbound: 'direct',
    must: false,
    source: {source_id: sourceId, file: `${sourceId}.dae`, line, column: 3}
  };
}
function build(content = 'routing {\n  fallback: direct\n}\n', patch: Partial<Parameters<typeof serviceRules>[0]> = {}) {
  const line = content.split('\n').findIndex(text => text.includes('fallback: direct')) + 1;
  return serviceRules({
    sources: [source(content)],
    rules: [rule('fallback: direct', line, 'fallback')],
    dnsRules: [],
    selected: ['telegram'],
    outbound: "'My proxy'",
    steamCn: false,
    ...patch
  });
}
const dns = 'dns {\n  routing {\n    request {\n      fallback: remote # keep DNS\n    }\n  }\n}\n';
const dnsFallback: DnsRoutingRule = {
  rule_id: 'dns',
  index: 0,
  kind: 'fallback',
  expression: 'fallback: remote',
  action: 'upstream',
  upstream: 'remote',
  source: {source_id: 'main', file: 'main.dae', line: 4, column: 7}
};

it('holds specific services before broad games and the first usable fallback, with Steam China direct first', () => {
  const before = rule('fallback: direct', 2, 'fallback');
  const rules = [rule('fallback: direct', 3, 'fallback'), before];
  const result = build(undefined, {rules, selected: ['category-games', 'telegram', 'steam'], steamCn: true});
  expect(result.rules.map(item => [item.condition, item.outbound])).toEqual([
    ['domain(geosite:steam@cn)', 'direct'],
    ['domain(geosite:steam)', "'My proxy'"],
    ['domain(geosite:telegram)', "'My proxy'"],
    ['dip(geoip:telegram)', "'My proxy'"],
    ['domain(geosite:category-games)', "'My proxy'"]
  ]);
  for (const held of result.rules) expect(held).toMatchObject({sourceId: 'main', list: 'routing', before, must: false});
});

it('holds a game service above a listed all-games rule, and other services before the fallback', () => {
  const content = 'routing {\n  domain(geosite:category-games) -> proxy\n  fallback: direct\n}\n';
  const games = {...rule('domain(geosite:category-games)', 2), outbound: 'proxy'};
  const before = rule('fallback: direct', 3, 'fallback');
  const result = build(content, {rules: [games, before], selected: ['steam', 'telegram', 'category-games']});
  expect(result.rules.map(item => [item.condition, item.before])).toEqual([
    ['domain(geosite:steam)', games],
    ['domain(geosite:telegram)', before],
    ['dip(geoip:telegram)', before]
  ]);
});

it.each(['direct', 'block'])('does not add Steam China direct for builtin %s', outbound => {
  const result = build(undefined, {selected: ['steam'], steamCn: true, outbound});
  expect(result.rules.map(item => item.condition)).toEqual(['domain(geosite:steam)']);
});

describe('duplicates', () => {
  it.each([
    '!domain(geosite:telegram) -> direct',
    'pname(app)||domain(geosite:telegram) -> direct',
    'DOMAIN(GEOSITE: Telegram) -> block',
    'domain(geosite:youtube, geosite: telegram, geosite:netflix) -> direct',
    'dip(GEOIP: TELEGRAM) -> direct',
    'l4proto(tcp)&&domain(suffix: example.com, geosite:telegram) -> direct',
    'domain(geosite: "telegram") -> direct',
    "domain('geosite:telegram') -> proxy",
    'domain("geosite:telegram", geosite:youtube) -> proxy'
  ])('skips the whole Telegram bundle for %s', expression => {
    const existing = rule(expression, 2);
    const result = build(undefined, {rules: [existing, rule('fallback: direct', 2, 'fallback')]});
    expect(result).toMatchObject({rules: [], refusal: false, dnsSkipped: false});
    expect(result.skipped).toContainEqual({service: 'telegram', rule: existing});
  });
  it('counts a held rule as present, so holding a service twice queues it once', () => {
    const first = build(undefined, {selected: ['steam']});
    const again = build(undefined, {selected: ['steam'], held: first.rules});
    expect(again.rules).toEqual([]);
    expect(again.skipped).toContainEqual({service: 'steam', held: true});
  });
  it('does not queue Steam China direct again when a held rule already has it', () => {
    const first = build(undefined, {selected: ['steam'], steamCn: true});
    const held = first.rules.filter(item => item.condition === 'domain(geosite:steam@cn)');
    expect(held).toHaveLength(1);
    const again = build(undefined, {selected: ['steam'], steamCn: true, held});
    expect(again.rules.map(item => item.condition)).toEqual(['domain(geosite:steam)']);
  });
  it.each(['qname(geosite: telegram) && qtype(https, svcb) -> reject', "qname(geosite:'telegram') -> reject"])(
    'keeps an existing Telegram DNS rule %s',
    expression => {
      const content = 'routing {\n  fallback: direct\n}\n' + dns;
      const existing: DnsRoutingRule = {...dnsFallback, rule_id: 'dns-tg', kind: 'rule', expression, action: 'reject', upstream: null};
      const fallback: DnsRoutingRule = {...dnsFallback, source: {source_id: 'main', file: 'main.dae', line: 7, column: 7}};
      expect(build(content, {dnsRules: [fallback]}).rules.map(item => item.list)).toEqual(['routing', 'routing', 'request']);
      expect(build(content, {dnsRules: [existing, fallback]}).rules.map(item => item.list)).toEqual(['routing', 'routing']);
    }
  );
  it('ignores comments and does not confuse plain categories with attributes', () => {
    const existing = rule('domain(geosite: steam@cn) -> direct # domain(geosite:telegram)', 2);
    const result = build(undefined, {selected: ['steam', 'telegram'], steamCn: true, rules: [existing, rule('fallback: direct', 2, 'fallback')]});
    expect(result.skipped).toEqual([]);
    expect(result.rules.map(item => item.condition)).toEqual(['domain(geosite:steam)', 'domain(geosite:telegram)', 'dip(geoip:telegram)']);
  });
});

it('refuses a missing or unusable fallback anchor without returning held rules', () => {
  const main = source('routing {\n  fallback: direct\n}\n');
  const refused = [
    build('routing {\n}\n', {rules: []}),
    build(undefined, {sources: [{...main, writable: false}]}),
    build(undefined, {rules: [rule('fallback: direct', 3, 'fallback')]})
  ];
  for (const result of refused) expect(result).toMatchObject({rules: [], refusal: true});
});

it.each([
  {content: dns, before: dnsFallback},
  {content: dns.replace('fallback:', 'default:'), before: {...dnsFallback, expression: 'default: remote'}},
  {content: dns.replace('      fallback: remote # keep DNS\n', ''), before: {...dnsFallback, source: null}},
  {content: 'dns {\n  routing {\n  }\n}\n', before: null}
])('holds the DNS companion before its fallback or at the request-list end', ({content, before}) => {
  const result = build(content + 'routing {\n  fallback: direct\n}\n', {dnsRules: before ? [before] : []});
  expect(result.dnsSkipped).toBe(false);
  expect(result.rules[2]).toMatchObject({
    sourceId: 'main',
    list: 'request',
    before: before?.source ? before : null,
    condition: 'qname(geosite: telegram) && qtype(https, svcb)',
    outbound: 'reject'
  });
});

it('skips a stale DNS fallback without refusing routing or silently using the list end', () => {
  const before = {...dnsFallback, source: {...dnsFallback.source!, line: 5}};
  const result = build(dns + 'routing {\n  fallback: direct\n}\n', {dnsRules: [before]});
  expect(result).toMatchObject({dnsSkipped: true, refusal: false});
  expect(result.rules.map(item => item.list)).toEqual(['routing', 'routing']);
  expect(build().dnsSkipped).toBe(true);
});

it('leaves another source unchanged for both DNS fallback and end placement', () => {
  const main = source('routing {\n  fallback: direct\n}\n');
  for (const withFallback of [true, false]) {
    const result = build(undefined, {
      sources: [main, source(withFallback ? dns : dns.replace('      fallback: remote # keep DNS\n', ''), 'other')],
      dnsRules: withFallback ? [{...dnsFallback, source: {...dnsFallback.source!, source_id: 'other'}}] : []
    });
    expect(result).toMatchObject({dnsSkipped: true, refusal: false});
    expect(result.rules.map(item => item.list)).toEqual(['routing', 'routing']);
    expect(result.rules.every(item => item.sourceId === 'main')).toBe(true);
  }
});

it('skips missing known categories, including Steam China, but leaves unknown presets to validation', () => {
  const result = build(undefined, {selected: ['steam', 'telegram', 'anthropic'], steamCn: true, preset: geodataPreset('metacubex-lite')});
  expect(result.skipped).toEqual(
    expect.arrayContaining([
      {service: 'steam', missing: ['geosite:steam', 'geosite:steam@cn']},
      {service: 'anthropic', missing: ['geosite:anthropic']}
    ])
  );
  expect(result.rules.map(item => item.condition)).toEqual(['domain(geosite:telegram)', 'dip(geoip:telegram)']);
  expect(build(undefined, {selected: ['steam'], preset: null}).skipped).toEqual([]);
});
