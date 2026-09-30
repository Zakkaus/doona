import {describe, expect, it} from 'vitest';
import {parseInterval, readSubscriptionEntries, writeSubscriptionEntry, type SubscriptionChange} from './subscriptions';
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

  it('changes the URL of each form and nothing else', () => {
    expect(edit('short', {tag: 'short', url: 'https://example.com/v2'})).toBe(
      text.replace("short: 'https://example.com/sub' # keep me", "short: 'https://example.com/v2' # keep me")
    );
    expect(edit('agent', {tag: 'agent', url: 'https://example.net/v2'})).toBe(text.replace("'https://example.net/sub'(", "'https://example.net/v2'("));
    expect(edit('old', {tag: 'old', url: 'https://example.org/v2'})).toBe(text.replace("url: 'https://example.org/old'", "url: 'https://example.org/v2'"));
    expect(edit('quoted tag', {tag: 'quoted tag', url: 'https://example.org/v2'})).toBe(
      text.replace("'https://example.org/new' {", "'https://example.org/v2' {")
    );
  });

  it('renames, keeping the form, the options and quotes where the tag had them', () => {
    expect(edit('agent', {tag: 'agent2', url: 'https://example.net/sub'})).toBe(text.replace('  agent:', '  agent2:'));
    expect(edit('old', {tag: 'fresh', url: 'https://example.org/x'})).toBe(
      text.replace("  old: {\n    url: 'https://example.org/old'", "  fresh: {\n    url: 'https://example.org/x'")
    );
    expect(edit('quoted tag', {tag: 'plain', url: 'https://example.org/new'})).toBe(text.replace("'quoted tag':", "'plain':"));
    expect(edit('short', {tag: 'two words', url: 'https://example.com/sub'})).toBe(text.replace('  short:', "  'two words':"));
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
    expect(write(text, 'old', {interval: 3600})).toBe(text.replace("'10000s'", "'3600s'"));
    expect(write(text, 'quoted tag', {ua: 'v2rayN', cache: false})).toBe(text.replace("ua: 'honk/1.0'\n    cache: true", "ua: 'v2rayN'\n    cache: false"));
    expect(write(text, 'quoted tag', {interval: 7200})).toBe(text.replace('    cache: true\n  }', '    cache: true\n    interval: 7200s\n  }'));
    expect(write(text, 'old', {ua: 'agent'})).toBe(text.replace("    interval: '10000s'\n  }", "    interval: '10000s'\n    ua: 'agent'\n  }"));
    expect(write(text, 'quoted tag', {ua: null})).toBe(text.replace("    ua: 'honk/1.0'\n", ''));
  });

  it('keeps the User-Agent when the interval of a block-form entry changes', () => {
    const source = "subscription {\n  paid: 'https://example.com/sub' { # work\n    ua: 'clash.meta' # provider wants it\n    interval: 1h\n  }\n}\n";
    const out = write(source, 'paid', {interval: 21600});
    expect(out).toBe(source.replace('interval: 1h', 'interval: 21600s'));
    expect(readSubscriptionEntries(out).map(({ua, interval}) => [ua, interval])).toEqual([['clash.meta', 21600]]);
  });

  it('turns a one-line entry into the options form when it gets an interval or cache', () => {
    const out = write(text, 'agent', {interval: 3600});
    expect(out).toBe(
      text.replace(
        "  agent: 'https://example.net/sub'(honk/1.0 like)",
        "  agent: 'https://example.net/sub' {\n    ua: 'honk/1.0 like'\n    interval: 3600s\n  }"
      )
    );
    expect(readSubscriptionEntries(out).find(entry => entry.tag === 'agent')).toMatchObject({ua: 'honk/1.0 like', interval: 3600, form: 'options'});
    expect(write(text, 'short', {cache: false})).toBe(
      text.replace("  short: 'https://example.com/sub' # keep me", "  short: 'https://example.com/sub' { # keep me\n    cache: false\n  }")
    );
    expect(write(text, 'example.org', {interval: 0})).toContain("  example.org: 'https://example.org/no_tag_link' {\n    interval: 0s\n  }");
    expect(write("subscription {\n\t'paid:https://example.com/sub'\n}", 'paid', {interval: 60})).toBe(
      "subscription {\n\tpaid: 'https://example.com/sub' {\n\t\tinterval: 60s\n\t}\n}"
    );
  });

  it('opens a one-line block before adding an option, and folds an emptied options block back', () => {
    const squeezed = "subscription {\n  s: { url: 'https://example.org/one' }\n}";
    expect(write(squeezed, 's', {interval: 3600})).toBe("subscription {\n  s: {\n    url: 'https://example.org/one'\n    interval: 3600s\n  }\n}");
    const lone = "subscription {\n  s: 'https://example.org/one' { ua: agent }\n}";
    expect(write(lone, 's', {ua: null})).toBe("subscription {\n  s: 'https://example.org/one'\n}");
    expect(write("subscription {\n  s: 'https://example.org/one' {\n    ua: agent\n  }\n}", 's', {ua: null})).toBe(
      "subscription {\n  s: 'https://example.org/one'\n}"
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
  expect(writeSubscriptionEntry(source, 'first', {interval: 3600})).toBe(source.replace("'2h'", "'3600s'"));
  expect(writeSubscriptionEntry(source, 'second', {interval: 0})).toContain("second: 'https://two.example/#' {\n    interval: 0s\n  }");
  const url = 'https://example.org/{#}?token=a\\b';
  expect(writeSubscriptionEntry(`subscription {\n  paid: '${url}'\n}\n`, 'paid', {interval: 3600})).toContain(`paid: '${url}' {`);
});
