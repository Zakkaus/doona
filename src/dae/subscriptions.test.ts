import {describe, expect, it} from 'vitest';
import {
  agentProblem,
  completeSubscriptionUrl,
  isSubscriptionUrl,
  parseInterval,
  readSubscriptionEntries,
  writeSubscriptionEntry,
  type SubscriptionChange
} from './subscriptions';
import {addSubtagsToGroup, classifyFilters, readGroupEntries, removeSubtagsFromGroup} from './groups';
import {LocalError} from '../api/error';

const text = `subscription {
  # the paid one
  short: 'https://example.com/sub' # keep me
  agent: 'https://example.net/sub'(honk/1.0 like)
  'https://example.org/no_tag_link'
  old: {
    url: 'https://example.org/old'
    interval: '10000s'
  }
  'quoted tag': 'https://example.org/new' {
    ua: 'honk/1.0'
    cache: true
  }
}

group {
  hk {
    filter: subtag(short, agent)
    filter: name(keyword: 'HK')
    policy: min_moving_avg
  }
  all {
    filter: subtag(old)
    policy: random
  }
}
`;

describe('readSubscriptionEntries', () => {
  const pick = (source: string) => readSubscriptionEntries(source).map(({tag, url, ua}) => [tag, url, ua]);

  it('reads each form with its options', () => {
    const entries = readSubscriptionEntries(text);
    expect(entries.map(({tag, url, form, naming, options, line}) => ({tag, url, form, naming, options, line}))).toEqual([
      {tag: 'short', url: 'https://example.com/sub', form: 'short', naming: 'tag', options: [], line: 3},
      {tag: 'agent', url: 'https://example.net/sub', form: 'agent', naming: 'tag', options: [{name: 'ua', value: 'honk/1.0 like'}], line: 4},
      {tag: 'example.org', url: 'https://example.org/no_tag_link', form: 'short', naming: 'host', options: [], line: 5},
      {tag: 'old', url: 'https://example.org/old', form: 'block', naming: 'tag', options: [{name: 'interval', value: "'10000s'"}], line: 6},
      {
        tag: 'quoted tag',
        url: 'https://example.org/new',
        form: 'options',
        naming: 'tag',
        options: [
          {name: 'ua', value: "'honk/1.0'"},
          {name: 'cache', value: 'true'}
        ],
        line: 10
      }
    ]);
    expect(entries.map(({ua, interval, cache}) => [ua, interval, cache])).toEqual([
      [null, null, null],
      ['honk/1.0 like', null, null],
      [null, null, null],
      [null, 10000, null],
      ['honk/1.0', null, true]
    ]);
  });

  // The cases below follow honk-config's parser tests (tests/entries.rs and its subscription fixtures).
  it('reads tagged, spaced, quoted and bare tags as honk does', () => {
    expect(pick('subscription {\n    paid : https://example.com/sub\n    paid plan: https://example.com/plan\n}')).toEqual([
      ['paid', 'https://example.com/sub', null],
      ['paid plan', 'https://example.com/plan', null]
    ]);
    expect(pick("subscription {\n    'paid # east': 'https://example.com/sub#token #data'('agent # build')\n}")).toEqual([
      ['paid # east', 'https://example.com/sub#token #data', 'agent # build']
    ]);
    expect(pick("subscription {\n 'https://example.com/sub'(agent:1)\n 'explicit:tag': 'https://example.com/explicit'(agent:2)\n}")).toEqual([
      ['example.com', 'https://example.com/sub', 'agent:1'],
      ['explicit:tag', 'https://example.com/explicit', 'agent:2']
    ]);
  });

  it('names an untagged entry by an embedded tag or by its host', () => {
    expect(pick("subscription {\n    'paid:https://example.com/sub'\n}")).toEqual([['paid', 'https://example.com/sub', null]]);
    expect(pick("subscription {\n 'paid:http://q/path#token #data'('agent # build')# note\n}")).toEqual([
      ['paid', 'http://q/path#token #data', 'agent # build']
    ]);
    expect(pick("subscription {\n    'https://example.org/sub'\n    https://example.net/sub\n}")).toEqual([
      ['example.org', 'https://example.org/sub', null],
      ['example.net', 'https://example.net/sub', null]
    ]);
    expect(pick("subscription {\n    'https://example.org/sub'(provider/2.0)\n}")).toEqual([['example.org', 'https://example.org/sub', 'provider/2.0']]);
  });

  it('keeps a glued comment out of the User-Agent and skips an agent a comment cuts short', () => {
    expect(pick("subscription {\n    sub: 'http://sub'(honk/1.0 like)#xxxx\n    other: 'http://other'(agent)# note\n}")).toEqual([
      ['sub', 'http://sub', 'honk/1.0 like'],
      ['other', 'http://other', 'agent']
    ]);
    expect(pick("subscription {\n    tag: 'https://h/p'(agent # build)\n}")).toEqual([]);
  });

  it('skips text after a quoted link, including a second entry on the same line', () => {
    expect(pick("subscription {\n  a: 'x' b: 'y'\n  'http://bad'junk\n  c: https://example.org\n}\n")).toEqual([['c', 'https://example.org', null]]);
    expect(pick("subscription { a: 'https://a.example/sub' b: 'https://b.example/sub'(agent) }")).toEqual([]);
  });

  it("reads the old block, one-line blocks and the options form with honk's value grammar", () => {
    const source = `subscription {
  detailed: {
    url: 'http://example.test/subscription'
    ua: 'provider/2.0'
    interval: '10000s'
  }
  inline: 'http://example.test/sub'(honk/1.0 like)
  squeezed: { url: https://example.org/one-line }
  b: 'https://example.test/b' {
    ua: 'v2rayN'
    interval: 1h
    cache: off
    route: direct
  }
  odd: 'https://example.test/odd' {
    url: 'https://example.test/ignored'
    interval: '1h30m'
    cache: maybe
  }
}`;
    expect(readSubscriptionEntries(source).map(({tag, url, form, ua, interval, cache}) => [tag, url, form, ua, interval, cache])).toEqual([
      ['detailed', 'http://example.test/subscription', 'block', 'provider/2.0', 10000, null],
      ['inline', 'http://example.test/sub', 'agent', 'honk/1.0 like', null, null],
      ['squeezed', 'https://example.org/one-line', 'block', null, null, null],
      ['b', 'https://example.test/b', 'options', 'v2rayN', 3600, false],
      ['odd', 'https://example.test/odd', 'options', null, null, null]
    ]);
  });

  it('reads the entries inside an old wrapper', () => {
    expect(pick("subscription {\n  wrapper {\n    a: 'http://example.test/sub'\n  }\n}")).toEqual([['a', 'http://example.test/sub', null]]);
    expect(pick("subscription {\n  a: b: {\n    url: 'http://example.test/sub'\n  }\n}")).toEqual([['url', 'http://example.test/sub', null]]);
  });

  it('reads the engine duration grammar', () => {
    expect([parseInterval('3600s'), parseInterval('2h'), parseInterval('90m'), parseInterval('1500ms'), parseInterval('86400')]).toEqual([
      3600, 7200, 5400, 2, 86400
    ]);
    expect([parseInterval('1.5h'), parseInterval('1h30m'), parseInterval('soon')]).toEqual([null, null, null]);
  });

  it('finds nothing without a subscription section', () => {
    expect(readSubscriptionEntries('global {}\nassets {\n subscription {\n  ua: agent\n }\n}\n')).toEqual([]);
  });
});

describe('writeSubscriptionEntry', () => {
  const edit = (tag: string, next: SubscriptionChange) => writeSubscriptionEntry(text, tag, next);

  it.each([
    ['short', 'short', 'https://example.com/v2', "short: 'https://example.com/sub' # keep me", "short: 'https://example.com/v2' # keep me"],
    ['agent', 'agent', 'https://example.net/v2', "'https://example.net/sub'(", "'https://example.net/v2'("],
    ['old', 'old', 'https://example.org/v2', "url: 'https://example.org/old'", "url: 'https://example.org/v2'"],
    ['quoted tag', 'quoted tag', 'https://example.org/v2', "'https://example.org/new' {", "'https://example.org/v2' {"]
  ])('changes the URL of the %s form and nothing else', (from, tag, url, before, after) => {
    expect(edit(from, {tag, url})).toBe(text.replace(before, after));
  });

  it.each([
    ['agent', 'agent2', 'https://example.net/sub', '  agent:', '  agent2:'],
    ['old', 'fresh', 'https://example.org/x', "  old: {\n    url: 'https://example.org/old'", "  fresh: {\n    url: 'https://example.org/x'"],
    ['quoted tag', 'plain', 'https://example.org/new', "'quoted tag':", "'plain':"],
    ['short', 'two words', 'https://example.com/sub', '  short:', "  'two words':"]
  ])('renames %s to %s, keeping the form, the options and quotes where the tag had them', (from, tag, url, before, after) => {
    expect(edit(from, {tag, url})).toBe(text.replace(before, after));
  });

  it('writes nothing when neither changes', () => {
    expect(edit('old', {tag: 'old', url: 'https://example.org/old'})).toBe(text);
  });

  it('refuses a tag another subscription uses, and an entry that is gone', () => {
    expect(() => edit('short', {tag: 'old', url: 'https://example.com/sub'})).toThrow(LocalError);
    expect(() => edit('missing', {tag: 'missing', url: 'https://example.com/sub'})).toThrow(LocalError);
  });

  it('finds and updates the groups whose subtag filter names a renamed tag', () => {
    const renamed = edit('short', {tag: 'fast', url: 'https://example.com/sub'});
    const citing = readGroupEntries(renamed).filter(group => classifyFilters(group).subtags.includes('short'));
    expect(citing.map(group => group.name)).toEqual(['hk']);
    const updated = citing.reduce((out, group) => removeSubtagsFromGroup(addSubtagsToGroup(out, group.name, ['fast']), group.name, ['short']), renamed);
    expect(updated).toBe(renamed.replace('filter: subtag(short, agent)', 'filter: subtag(agent, fast)'));
    // A group whose only filter names the old tag keeps a filter rather than widening to every node.
    const alone = edit('old', {tag: 'older', url: 'https://example.org/old'});
    expect(removeSubtagsFromGroup(addSubtagsToGroup(alone, 'all', ['older']), 'all', ['old'])).toBe(
      alone.replace('filter: subtag(old)', 'filter: subtag(older)')
    );
  });
});

describe('writeSubscriptionEntry options', () => {
  const write = (source: string, tag: string, change: SubscriptionChange) => writeSubscriptionEntry(source, tag, change);

  it('sets, changes and removes the User-Agent of a one-line entry in parentheses', () => {
    expect(write(text, 'short', {ua: 'clash.meta'})).toBe(text.replace("short: 'https://example.com/sub' #", "short: 'https://example.com/sub'(clash.meta) #"));
    expect(write(text, 'agent', {ua: 'v2rayN'})).toBe(text.replace('(honk/1.0 like)', '(v2rayN)'));
    expect(write(text, 'agent', {ua: 'odd # agent'})).toBe(text.replace('(honk/1.0 like)', "('odd # agent')"));
    expect(write(text, 'agent', {ua: null})).toBe(text.replace('(honk/1.0 like)', ''));
    expect(write("subscription {\n  x: 'https://h/p'('a b')\n}", 'x', {ua: 'c'})).toBe("subscription {\n  x: 'https://h/p'('c')\n}");
  });

  it('quotes a bare link that gets an agent, and names an untagged entry whose link changes', () => {
    expect(write('subscription {\n  c: https://example.org/sub\n}', 'c', {ua: 'agent'})).toBe("subscription {\n  c: 'https://example.org/sub'(agent)\n}");
    expect(write(text, 'example.org', {url: 'https://example.com/moved'})).toBe(
      text.replace("'https://example.org/no_tag_link'", "example.org: 'https://example.com/moved'")
    );
    expect(write(text, 'example.org', {ua: 'x'})).toBe(text.replace("'https://example.org/no_tag_link'", "'https://example.org/no_tag_link'(x)"));
    const embedded = "subscription {\n  'paid:https://example.com/sub'(agent) # note\n}";
    expect(write(embedded, 'paid', {url: 'https://example.com/v2'})).toBe("subscription {\n  paid: 'https://example.com/v2'(agent) # note\n}");
  });

  it('changes the options of a block in place, keeping quotes, comments and other options', () => {
    expect(write(text, 'old', {interval: 3600})).toBe(text.replace("'10000s'", "'1h'"));
    expect(write(text, 'quoted tag', {ua: 'v2rayN', cache: false})).toBe(text.replace("ua: 'honk/1.0'\n    cache: true", "ua: 'v2rayN'\n    cache: false"));
    expect(write(text, 'quoted tag', {interval: 7200})).toBe(text.replace('    cache: true\n  }', '    cache: true\n    interval: 2h\n  }'));
    expect(write(text, 'old', {ua: 'agent'})).toBe(text.replace("    interval: '10000s'\n  }", "    interval: '10000s'\n    ua: 'agent'\n  }"));
    expect(write(text, 'quoted tag', {ua: null})).toBe(text.replace("    ua: 'honk/1.0'\n", ''));
  });

  it.each([
    [5400, '90m'],
    [2700, '45m'],
    [7200, '2h'],
    [90, '90s']
  ])('writes an interval of %i seconds in its shortest exact form, %s', (interval, written) => {
    const out = write(text, 'old', {interval});
    expect(out).toBe(text.replace("'10000s'", `'${written}'`));
    expect(readSubscriptionEntries(out).find(entry => entry.tag === 'old')?.interval).toBe(interval);
  });

  it('keeps the User-Agent when the interval of a block-form entry changes', () => {
    const source = "subscription {\n  paid: 'https://example.com/sub' { # work\n    ua: 'clash.meta' # provider wants it\n    interval: 1h\n  }\n}\n";
    const out = write(source, 'paid', {interval: 21600});
    expect(out).toBe(source.replace('interval: 1h', 'interval: 6h'));
    expect(readSubscriptionEntries(out).map(({ua, interval}) => [ua, interval])).toEqual([['clash.meta', 21600]]);
  });

  it('turns a one-line entry into the URL-field block form when it gets an interval or cache', () => {
    const out = write(text, 'agent', {interval: 3600});
    expect(out).toBe(
      text.replace(
        "  agent: 'https://example.net/sub'(honk/1.0 like)",
        "  agent: {\n    url: 'https://example.net/sub'\n    ua: 'honk/1.0 like'\n    interval: 1h\n  }"
      )
    );
    expect(readSubscriptionEntries(out).find(entry => entry.tag === 'agent')).toMatchObject({ua: 'honk/1.0 like', interval: 3600, form: 'block'});
    expect(write(text, 'short', {cache: false})).toBe(
      text.replace("  short: 'https://example.com/sub' # keep me", "  short: { # keep me\n    url: 'https://example.com/sub'\n    cache: false\n  }")
    );
    expect(write(text, 'example.org', {interval: 0})).toContain("  example.org: {\n    url: 'https://example.org/no_tag_link'\n    interval: 0s\n  }");
    expect(write("subscription {\n\t'paid:https://example.com/sub'\n}", 'paid', {interval: 60})).toBe(
      "subscription {\n\tpaid: {\n\t\turl: 'https://example.com/sub'\n\t\tinterval: 1m\n\t}\n}"
    );
  });

  it('keeps a simultaneous rename when converting a scalar entry to an options block', () => {
    const source = "subscription {\n  old: 'https://example.org/sub' # keep\n}\n";
    const out = write(source, 'old', {tag: 'new', interval: 3600});
    expect(out).toBe("subscription {\n  new: { # keep\n    url: 'https://example.org/sub'\n    interval: 1h\n  }\n}\n");
    expect(readSubscriptionEntries(out)).toMatchObject([{tag: 'new', interval: 3600}]);
  });

  it('opens a one-line block before adding an option, and folds an emptied options block back', () => {
    const squeezed = "subscription {\n  s: { url: 'https://example.org/one' }\n}";
    expect(write(squeezed, 's', {interval: 3600})).toBe("subscription {\n  s: {\n    url: 'https://example.org/one'\n    interval: 1h\n  }\n}");
    const lone = "subscription {\n  s: 'https://example.org/one' { ua: agent }\n}";
    expect(write(lone, 's', {ua: null})).toBe("subscription {\n  s: 'https://example.org/one'\n}");
    expect(write("subscription {\n  s: 'https://example.org/one' {\n    ua: agent\n  }\n}", 's', {ua: null})).toBe(
      "subscription {\n  s: 'https://example.org/one'\n}"
    );
  });

  it('writes an interval in the largest exact unit and keeps an unchanged one as written', () => {
    const one = (seconds: number) => write(text, 'quoted tag', {interval: seconds}).match(/cache: true\n +interval: (.*)/)![1];
    expect([21600, 5400, 90, 0, 86400].map(one)).toEqual(['6h', '90m', '90s', '0s', '24h']);
    const hour = "subscription {\n  s: 'https://example.org/one' {\n    interval: 60m\n  }\n}";
    expect(write(hour, 's', {interval: 3600})).toBe(hour);
    expect(write(hour, 's', {ua: 'agent'})).toBe(hour.replace('60m\n', "60m\n    ua: 'agent'\n"));
  });

  it('writes new option lines with the indentation the file already uses', () => {
    const four = "subscription {\n    a: 'https://example.org/a'\n    b: 'https://example.org/b'\n}";
    expect(write(four, 'a', {interval: 3600})).toBe(
      four.replace("a: 'https://example.org/a'\n", "a: {\n        url: 'https://example.org/a'\n        interval: 1h\n    }\n")
    );
    const nested = "subscription {\n    s: { url: 'https://example.org/one' }\n}";
    expect(write(nested, 's', {cache: true})).toBe("subscription {\n    s: {\n        url: 'https://example.org/one'\n        cache: true\n    }\n}");
    const empty = "subscription {\n    s: 'https://example.org/one' {\n    }\n}";
    expect(write(empty, 's', {cache: false})).toBe("subscription {\n    s: 'https://example.org/one' {\n        cache: false\n    }\n}");
    // Another entry's options set the step even where the section's own is different.
    const mixed = "subscription {\n  a: 'https://example.org/a' {\n      ua: x\n  }\n  b: 'https://example.org/b'\n}";
    expect(write(mixed, 'b', {interval: 60})).toBe(
      mixed.replace("b: 'https://example.org/b'\n", "b: {\n      url: 'https://example.org/b'\n      interval: 1m\n  }\n")
    );
    // Without a section step, the file's first indented line.
    const flat = "global {\n   log_level: info\n}\nsubscription {\ns: 'https://example.org/one'\n}";
    expect(write(flat, 's', {interval: 0})).toBe(
      flat.replace("s: 'https://example.org/one'\n", "s: {\n   url: 'https://example.org/one'\n   interval: 0s\n}\n")
    );
  });

  it('writes nothing when the options do not change and refuses an unquotable agent', () => {
    expect(write(text, 'old', {interval: 10000})).toBe(text);
    expect(write(text, 'agent', {ua: 'honk/1.0 like'})).toBe(text);
    expect(() => write(text, 'agent', {ua: "o'brien"})).toThrow(LocalError);
  });
});

it('keeps quoted braces and hashes as data across repeated sections', () => {
  const source = `subscription {
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
  expect(readSubscriptionEntries(source).map(entry => [entry.tag, entry.ua, entry.interval])).toEqual([
    ['first', 'agent } #', 7200],
    ['second', null, null]
  ]);
  expect(writeSubscriptionEntry(source, 'first', {interval: 3600})).toBe(source.replace("'2h'", "'1h'"));
  expect(writeSubscriptionEntry(source, 'second', {interval: 0})).toContain("second: {\n    url: 'https://two.example/#'\n    interval: 0s\n  }");
  const url = 'https://example.org/{#}?token=a\\b';
  expect(writeSubscriptionEntry(`subscription {\n  paid: '${url}'\n}\n`, 'paid', {interval: 3600})).toContain(`paid: {\n    url: '${url}'`);
});

it('judges a User-Agent against the contract bound, and one written into an entry against quoting too', () => {
  expect(agentProblem('', false)).toBeNull();
  expect(agentProblem('  clash.meta  ', true)).toBeNull();
  expect(agentProblem('agent\u00e9', false)).toBe('nodes.agentInvalid');
  expect(agentProblem('a'.repeat(257), false)).toBe('nodes.agentInvalid');
  expect(agentProblem(`it's "x"`, false)).toBeNull();
  expect(agentProblem(`it's "x"`, true)).toBe('config.unquotable');
});

it("reads and writes the download route, replacing the old block form's download_detour", () => {
  const source = `subscription {
  plain: 'https://one.example/sub'
  opts: 'https://two.example/sub' {
    ua: 'clash'
    route: direct
  }
  old: {
    url: 'https://three.example/sub'
    download_detour: proxy
  }
}
`;
  expect(readSubscriptionEntries(source).map(entry => entry.route)).toEqual([null, 'direct', 'proxy']);
  expect(writeSubscriptionEntry(source, 'plain', {route: 'direct'})).toContain("plain: {\n    url: 'https://one.example/sub'\n    route: direct\n  }");
  expect(writeSubscriptionEntry(source, 'plain', {route: 'my group'})).toContain("route: 'my group'\n");
  expect(writeSubscriptionEntry(source, 'opts', {route: 'proxy'})).toContain("    ua: 'clash'\n    route: proxy\n  }");
  expect(writeSubscriptionEntry(source, 'opts', {route: null})).toContain("opts: 'https://two.example/sub' {\n    ua: 'clash'\n  }");
  const old = writeSubscriptionEntry(source, 'old', {route: 'direct'});
  expect(old).toContain("old: {\n    url: 'https://three.example/sub'\n    route: direct\n  }");
  expect(old).not.toContain('download_detour');
  expect(readSubscriptionEntries(writeSubscriptionEntry(source, 'old', {route: null})).find(entry => entry.tag === 'old')!.route).toBeNull();
  expect(writeSubscriptionEntry(source, 'opts', {route: 'direct'})).toBe(source);
});

describe('completeSubscriptionUrl', () => {
  it.each([
    ['xxx.com/sub?t=1', 'https://xxx.com/sub?t=1'],
    ['  xxx.com  ', 'https://xxx.com'],
    ['http://a.com', 'http://a.com'],
    ['HTTPS://a.com', 'https://a.com'],
    ['Http://a.com/Path', 'http://a.com/Path'],
    ['mailto:user@example.com', 'mailto:user@example.com'],
    ['vless:id@a.com:443', 'vless:id@a.com:443'],
    ['user:pw@a.com', 'user:pw@a.com'],
    ['a.com:443/x', 'https://a.com:443/x'],
    ['abc:123', 'abc:123'],
    ['vless://id@a.com:443', 'vless://id@a.com:443'],
    ['ftp://a.com', 'ftp://a.com'],
    ['abc', 'abc'],
    ['localhost:8080/s', 'https://localhost:8080/s'],
    ['192.168.1.1/s', 'https://192.168.1.1/s'],
    ['[::1]:8080/s', 'https://[::1]:8080/s'],
    ['', '']
  ])('completes %j to %j', (value, expected) => {
    expect(completeSubscriptionUrl(value)).toBe(expected);
  });

  it('accepts a completed address and still refuses other schemes and bare words', () => {
    expect(isSubscriptionUrl('xxx.com/sub')).toBe(true);
    expect(isSubscriptionUrl('http://a.com')).toBe(true);
    expect(isSubscriptionUrl('HTTPS://a.com')).toBe(true);
    expect(isSubscriptionUrl('mailto:user@example.com')).toBe(false);
    expect(isSubscriptionUrl('ftp://a.com')).toBe(false);
    expect(isSubscriptionUrl('vless://id@a.com:443')).toBe(false);
    expect(isSubscriptionUrl('abc')).toBe(false);
    expect(isSubscriptionUrl('')).toBe(false);
  });
});
