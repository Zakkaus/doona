import {describe, expect, it} from 'vitest';
import {parseInterval, readSubscriptions, writeInterval} from './subscriptions';

const text = `global {
  log_level: info
}

subscription {
  primary: 'https://example.com/sub'
  compatible: 'https://example.net/sub'(honk/1.0 like) # keep the agent
  'https://example.org/no_tag_link'
  'paid:https://example.com/paid'
  detailed: {
    url: 'https://example.org/sub'
    ua: 'honk/1.0'
    interval: '10000s'
  }
  manual: {
    url: "https://example.org/manual"
    interval: 0
  }
  squeezed: { url: 'https://example.org/one-line' }
}

dns {
  routing {
    request { fallback: alidns }
  }
}
`;

describe('readSubscriptions', () => {
  it('lists every entry form with its interval', () => {
    expect(readSubscriptions(text).map(e => [e.tag, e.interval])).toEqual([
      ['primary', null],
      ['compatible', null],
      ['example.org', null],
      ['paid', null],
      ['detailed', 10000],
      ['manual', 0]
    ]);
  });

  it("keeps each entry's host for matching a provider by its URL", () => {
    expect(readSubscriptions(text).map(e => e.host)).toEqual(['example.com', 'example.net', 'example.org', 'example.com', 'example.org', 'example.org']);
  });

  it('reads the engine duration grammar', () => {
    expect(parseInterval('3600s')).toBe(3600);
    expect(parseInterval('2h')).toBe(7200);
    expect(parseInterval('90m')).toBe(5400);
    expect(parseInterval('1500ms')).toBe(2);
    expect(parseInterval('86400')).toBe(86400);
    expect(parseInterval('soon')).toBeNull();
  });

  it('finds nothing without a subscription section', () => {
    expect(readSubscriptions('global {}\n')).toEqual([]);
  });
});

describe('writeInterval', () => {
  it('turns a scalar entry into a block and keeps its agent', () => {
    const next = writeInterval(text, 'compatible', 3600);
    expect(next).toContain(
      `  compatible: {\n    url: 'https://example.net/sub'\n    ua: 'honk/1.0 like'\n    interval: '3600s'\n  } # keep the agent\n  'https://example.org/no_tag_link'`
    );
    expect(readSubscriptions(next).find(e => e.tag === 'compatible')?.interval).toBe(3600);
  });

  it('names a tagless entry after its host and drops an embedded tag from the url', () => {
    expect(writeInterval(text, 'example.org', 0)).toContain(`  example.org: {\n    url: 'https://example.org/no_tag_link'\n    interval: '0s'\n  }`);
    expect(writeInterval(text, 'paid', 21600)).toContain(`  paid: {\n    url: 'https://example.com/paid'\n    interval: '21600s'\n  }`);
  });

  it('writes explicit intervals even for 24 hours without assuming an engine default', () => {
    expect(writeInterval(text, 'detailed', 43200)).toContain(`    ua: 'honk/1.0'\n    interval: '43200s'\n  }`);
    expect(writeInterval(text, 'detailed', 86400)).toContain(`    ua: 'honk/1.0'\n    interval: '86400s'\n  }`);
    expect(writeInterval(text, 'manual', 3600)).toContain(`    url: "https://example.org/manual"\n    interval: '3600s'\n  }`);
  });

  it('leaves the text alone when nothing changes', () => {
    expect(readSubscriptions(writeInterval(text, 'primary', 86400)).find(entry => entry.tag === 'primary')?.interval).toBe(86400);
    expect(writeInterval(text, 'detailed', 10000)).toBe(text);
    expect(writeInterval(text, 'squeezed', 0)).toBe(text);
    expect(writeInterval(text, 'missing', 0)).toBe(text);
  });
});

it('uses shared ranges across repeated sections without interpreting quoted braces as structure', () => {
  const text = `subscription {
  first: {
    url: 'https://one.example/{#}'
    ua: 'agent } #'
    interval: '2h'
  }
}
subscription {
  second: 'https://two.example/#'
}
`;
  expect(readSubscriptions(text).map(entry => [entry.tag, entry.interval])).toEqual([
    ['first', 7200],
    ['second', null]
  ]);
  const out = writeInterval(text, 'first', 3600);
  expect(out).toBe(text.replace("'2h'", "'3600s'"));
  expect(writeInterval(text, 'second', 0)).toContain("url: 'https://two.example/#'");
});

it('rewrites only the selected scalar when subscriptions share a physical line', () => {
  const source = "subscription { a: 'https://a.example/sub' b: 'https://b.example/sub'(agent) }";
  expect(readSubscriptions(source).map(entry => entry.tag)).toEqual(['a', 'b']);
  const first = writeInterval(source, 'a', 3600);
  expect(first).toContain("b: 'https://b.example/sub'(agent)");
  expect(readSubscriptions(first).map(entry => [entry.tag, entry.interval])).toEqual([
    ['a', 3600],
    ['b', null]
  ]);
  const second = writeInterval(source, 'b', 0);
  expect(second).toContain("a: 'https://a.example/sub'");
  expect(readSubscriptions(second).map(entry => [entry.tag, entry.interval])).toEqual([
    ['a', null],
    ['b', 0]
  ]);
  expect(second).toContain("ua: 'agent'");
});

it('does not turn unreadable or unspecified intervals into manual-only or a presumed default', () => {
  const entries = readSubscriptions(
    "subscription {\n  complex: {\n    url: 'https://example.org'\n    interval: '1h30m'\n  }\n  absent: {\n    url: 'https://example.net'\n  }\n}"
  );
  expect(entries.map(entry => entry.interval)).toEqual([null, null]);
});

it('keeps a same-line comment when a one-line subscription becomes a block', () => {
  const text = "subscription {\n  paid: 'https://example.org/sub' # work account\n}\n";
  const out = writeInterval(text, 'paid', 3600);
  expect(out).toContain('# work account');
  expect(out).toContain("interval: '3600s'");
});
