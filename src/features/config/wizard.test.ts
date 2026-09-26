import {describe, expect, it} from 'vitest';
import {nextSubscriptionName, readState, validNetwork, validSubscriptions, writeState} from '../../dae/setup';
import {readGroupEntries} from '../../dae/groups';

it('keeps template groups inside an inline group section', () => {
  const text = 'subscription {}\ngroup { proxy { policy: fixed(2) } }\nrouting { fallback: proxy }\n';
  const out = writeState(text, {...readState(text), rules: 'standard'});
  expect(readGroupEntries(out).map(group => group.name)).toEqual(['proxy', 'auto', 'telegram', 'media', 'apple']);
  expect(readGroupEntries(out)[0].policy).toBe('fixed(2)');
  expect(writeState(out, {...readState(out), rules: 'standard'})).toBe(out);
});

it('keeps block subscriptions as indivisible raw entries', () => {
  const text = "subscription {\n  paid: {\n    url: 'https://example.org/{#}'\n    interval: '2h'\n  }\n}\ngroup { proxy {} }\n";
  const state = readState(text);
  expect(state.subscriptions).toEqual([
    {name: '', tag: 'paid', url: '', section: 0, raw: "  paid: {\n    url: 'https://example.org/{#}'\n    interval: '2h'\n  }"}
  ]);
  expect(writeState(text, state)).toBe(text);
  expect(writeState(text, {...state, subscriptions: []})).not.toContain('paid:');
});

it('adds new subscriptions to the last subscription section', () => {
  const text = "subscription { a: 'https://a.example' }\nsubscription { b: 'https://b.example' }\ngroup { proxy {} }\n";
  const state = readState(text);
  state.subscriptions.push({name: 'c', url: 'https://c.example'});
  const out = writeState(text, state);
  expect(out.startsWith("subscription { a: 'https://a.example' }\n")).toBe(true);
  expect(readState(out).subscriptions.find(item => item.name === 'c')?.section).toBe(1);
});

const main = `global {
  lan_interface: br-lan
}

subscription {
  sub-c: 'https://example.org/sub?token=abc'
  # a file the engine reads
  'local': 'file:///etc/honk/nodes.txt'
}

group {
  proxy {
    filter: name(hk-01, sg-01)
    policy: fixed(0)
  }
  spare { policy: min_moving_avg }
}

routing {
  dip(geoip:cn) -> direct
  fallback: proxy
}
`;

describe('quick setup text transforms', () => {
  it('reads and keeps sections written on one line', () => {
    const oneLine =
      "global { lan_interface: eth0 }\nsubscription { a: 'https://x.example/sub' }\ngroup { proxy { policy: fixed(0) } }\nrouting { fallback: proxy }\n";
    const state = readState(oneLine);
    expect(state.lanInterface).toBe('eth0');
    expect(state.subscriptions.map(s => [s.name, s.url])).toEqual([['a', 'https://x.example/sub']]);
    expect(state.group).toBe('proxy');
    const out = writeState(oneLine, {...state, rules: 'global'});
    expect(out).toContain('group { proxy { policy: fixed(0) } }');
    expect(out).not.toContain('routing { fallback: proxy }');
    expect(out).toContain('pname(NetworkManager) -> direct');
    expect(out.match(/^routing \{/gm)).toHaveLength(1);
  });
  it('reads the subscriptions it models, keeps the rest as written, and names the first group', () => {
    const state = readState(main);
    expect(state.subscriptions.map(s => [s.name, s.url])).toEqual([
      ['sub-c', 'https://example.org/sub?token=abc'],
      ['', ''],
      ['', '']
    ]);
    expect(state.subscriptions[1].raw).toBe('  # a file the engine reads');
    expect(state.subscriptions[2].raw).toBe("  'local': 'file:///etc/honk/nodes.txt'");
    expect(state.group).toBe('proxy');
    expect(state.lanInterface).toBe('br-lan');
    expect(state.rules).toBe('keep');
  });
  it('writes back untouched lines verbatim and leaves multi-line groups alone', () => {
    const state = readState(main);
    state.subscriptions[0] = {name: 'sub-c', url: 'https://example.org/new'};
    const out = writeState(main, state);
    expect(out).toContain("  sub-c: 'https://example.org/new'");
    expect(out).toContain('  # a file the engine reads');
    expect(out).toContain("  'local': 'file:///etc/honk/nodes.txt'");
    expect(out).toContain('  proxy {\n    filter: name(hk-01, sg-01)\n    policy: fixed(0)\n  }');
    expect(out).toContain('  dip(geoip:cn) -> direct');
    expect(readState(out).subscriptions.map(s => [s.name, s.url])).toEqual(state.subscriptions.map(s => [s.name, s.url]));
  });
  it('round-trips an untouched file, blank lines in the subscription block included', () => {
    const spaced = main.replace('  # a file the engine reads\n', '\n  # a file the engine reads\n');
    expect(writeState(spaced, readState(spaced))).toBe(spaced);
  });
  it('replaces routing with a template routed to the first group', () => {
    const out = writeState(main, {...readState(main), rules: 'gfw'});
    expect(out).toContain('domain(geosite:gfw) -> proxy');
    expect(out).toContain('  fallback: direct');
    expect(out).not.toContain('dip(geoip:cn) -> direct');
    expect(out.match(/^routing \{/gm)).toHaveLength(1);
  });
  it('adds the groups a template needs and leaves the ones the file has alone', () => {
    const out = writeState(main, {...readState(main), rules: 'standard'});
    // The existing `proxy` stays as written; the template's other groups are appended inside the section.
    expect(out).toContain('  proxy {\n    filter: name(hk-01, sg-01)\n    policy: fixed(0)\n  }');
    expect(out.match(/^group \{/gm)).toHaveLength(1);
    expect(out).toContain("  auto {\n    filter: !name('direct', 'block')\n    policy: min_moving_avg\n  }");
    expect(out).toContain(
      "  telegram {\n    filter: group('proxy', 'auto')\n    filter: !name('direct', 'block')\n    policy: select\n    default: 'proxy'\n  }"
    );
    expect(out).toContain('domain(geosite:apple) -> apple');
    expect(out).toContain('domain(geosite:microsoft) -> direct');
    expect(out).toContain('  fallback: proxy');
    const again = writeState(out, {...readState(out), rules: 'standard'});
    expect(again).toBe(out);
    const full = writeState(main, {...readState(main), rules: 'full'});
    expect(full).toContain("  tw {\n    filter: name(regex: '");
    expect(full).toContain("  bahamut {\n    filter: group('tw', 'proxy', 'auto')");
    expect(full).toContain('domain(geosite:bilibili) -> direct');
  });
  it('adds groups only for a selected template and generates a whole file for an empty source', () => {
    // A group name outside [\w-] is still the routing target, and its section is still left alone.
    const odd = main.replace('  proxy {', '  proxy.eu {');
    expect(readState(odd).group).toBe('proxy.eu');
    const written = writeState(odd, {...readState(odd), rules: 'global'});
    expect(written).toContain('  proxy.eu {\n    filter: name(hk-01, sg-01)');
    expect(written).toContain('fallback: proxy.eu');
    // honk names a quoted group by its header text, quotes and all, so the template repeats it as written.
    const quoted = main.replace('  proxy {', "  'proxy' {");
    expect(writeState(quoted, {...readState(quoted), rules: 'global'})).toContain("fallback: 'proxy'");
    const spaced = main.replace('  proxy {', '  "my group" {');
    expect(writeState(spaced, {...readState(spaced), rules: 'gfw'})).toContain('domain(geosite:gfw) -> "my group"');
    const noGroup = main.replace(/group \{[\s\S]*?\n\}\n/, '');
    const state = readState(noGroup);
    expect(state.group).toBeNull();
    expect(writeState(noGroup, state)).toBe(noGroup);
    const fresh = writeState('', {...readState(''), subscriptions: [{name: 'sub', url: 'https://example.org/sub'}]});
    expect(fresh).toContain('lan_interface: auto');
    expect(fresh).toContain('      qname(geosite:cn) -> alidns\n      fallback: cloudflare');
    expect(fresh).toContain("  proxy {\n    filter: group('auto')\n    filter: !name('direct', 'block')\n    policy: select\n    default: 'auto'\n  }");
    expect(fresh).toContain('geosite:category-games@cn) -> direct');
    expect(fresh).toContain('fallback: proxy');
  });
});

it('preserves repeated inline sections and quoted hashes and braces while changing one subscription', () => {
  const source = `subscription { a: 'https://example.org/{#}' } # }
group { 'proxy.eu' { policy: random } }
subscription {
  b: 'https://example.net/#fragment'
}
routing { fallback: proxy.eu }
`;
  const state = readState(source);
  expect(state.subscriptions.map(item => item.url)).toEqual(['https://example.org/{#}', 'https://example.net/#fragment']);
  expect(writeState(source, state)).toBe(source);
  state.subscriptions[1] = {...state.subscriptions[1], url: 'https://example.net/new', raw: undefined};
  const written = writeState(source, state);
  expect(written).toBe(source.replace('https://example.net/#fragment', 'https://example.net/new'));
});

it('preserves subscription identity when only its URL changes and rejects duplicate tags', () => {
  const text = "subscription {\n  sub.eu: 'https://example.org/old'\n  'sub eu': 'https://example.net/old'\n}\ngroup { proxy { filter: subtag('sub.eu') } }\n";
  const state = readState(text);
  state.subscriptions[0] = {...state.subscriptions[0], url: 'https://example.org/new', raw: undefined};
  state.subscriptions[1] = {...state.subscriptions[1], url: 'https://example.net/new', raw: undefined};
  expect(writeState(text, state)).toBe(text.replaceAll('/old', '/new'));
  expect(validSubscriptions(state.subscriptions)).toBe(true);
  state.subscriptions.push({name: 'sub.eu', url: 'https://duplicate.example'});
  expect(validSubscriptions(state.subscriptions)).toBe(false);
  const opaque = readState("subscription { paid: { url: 'https://example.org/sub' } }").subscriptions;
  expect(validSubscriptions([...opaque, {name: 'paid', url: 'https://duplicate.example'}])).toBe(false);
  expect(validSubscriptions([{name: ' ', url: 'https://example.org'}])).toBe(false);
});

it('does not inject subscriptions or groups into untouched setup', () => {
  const source = 'global {\n  tproxy_port: 12345\n}\nrouting {\n  fallback: direct\n}\n';
  expect(writeState(source, readState(source))).toBe(source);
});

it('replaces every top-level routing block without changing nested DNS routing or other bytes', () => {
  const dns = "dns { upstream { local: 'udp://192.0.2.1:53' } routing { request { fallback: local } } }";
  const text = `group { mix {} }\nrouting { fallback: direct }\n${dns}\n# retained\nrouting { domain(example.org) -> block }\nnode {}\n`;
  const written = writeState(text, {...readState(text), rules: 'global'});
  expect(written).not.toContain('domain(example.org)');
  expect(written.match(/^routing \{/gm)).toHaveLength(1);
  expect(written).toContain('fallback: mix');
  expect(written).toContain(`${dns}\n# retained\n\nnode {}\n`);
});

it('writes explicit first-run network inputs and rejects missing or invalid listener settings', () => {
  const state = {...readState(''), listenerPort: '23456', defaultDns: 'udp://192.0.2.1:53', chinaDns: 'tls://resolver.example:853'};
  const written = writeState('', state);
  expect(written).toContain('tproxy_port: 23456');
  expect(written).toContain("cloudflare: 'udp://192.0.2.1:53'");
  expect(written).toContain("alidns: 'tls://resolver.example:853'");
  expect(validNetwork(state)).toBe(true);
  expect(validNetwork({...state, listenerPort: '65536'})).toBe(false);
  expect(validNetwork({...state, listenerPort: '0'})).toBe(false);
  expect(validNetwork({...state, listenerPort: '53\nnode {}'})).toBe(false);
  expect(validNetwork({...state, defaultDns: ' '})).toBe(false);
});

describe('setup writes what dae reads back', () => {
  it('quotes a group name that needs quotes where the templates route to it', () => {
    const text = "group {\n  'my group' {\n    policy: min\n  }\n}\nrouting {\n  fallback: direct\n}\n";
    const out = writeState(text, {...readState(text), rules: 'global'});
    expect(out).toContain("fallback: 'my group'");
    expect(out).not.toMatch(/fallback: my group/);
  });

  it('writes subscription names trimmed and treats trimmed names as duplicates', () => {
    const state = readState('');
    const subscriptions = [
      {name: 'a ', url: 'https://example.org/a'},
      {name: 'a', url: 'https://example.org/b'}
    ];
    expect(validSubscriptions(subscriptions)).toBe(false);
    const out = writeState('', {...state, subscriptions: [{name: ' paid ', url: 'https://example.org/sub'}]});
    expect(out).toContain("paid: 'https://example.org/sub'");
  });

  it('adds to an empty subscription block without a blank first line', () => {
    const text = 'subscription {}\n';
    const state = readState(text);
    expect(state.subscriptions).toEqual([]);
    const out = writeState(text, {...state, subscriptions: [{name: 'paid', url: 'https://example.org/sub'}]});
    expect(out).toContain("subscription {\n  paid: 'https://example.org/sub'\n}");
  });
});

it('names a new subscription after the first free sub-N', () => {
  expect(nextSubscriptionName([])).toBe('sub-1');
  expect(nextSubscriptionName([{name: 'sub-2', url: ''}])).toBe('sub-3');
  expect(
    nextSubscriptionName([
      {name: 'a', url: ''},
      {name: '', url: '', raw: 'sub-3 {}', tag: 'sub-3'}
    ])
  ).toBe('sub-4');
});

it('reads the option after a quoted subscription URL apart from the URL', () => {
  const [sub] = readState("subscription {\n  a: 'https://x.example/sub'(clash)\n}\n").subscriptions;
  expect([sub.url, sub.suffix]).toEqual(['https://x.example/sub', '(clash)']);
});

it('keeps the option after a subscription URL when the URL is edited', () => {
  const text = "subscription {\n  a: 'https://x.example/sub'(clash)\n}\n";
  const [sub] = readState(text).subscriptions;
  const out = writeState(text, {...readState(text), subscriptions: [{...sub, url: 'https://y.example/sub', raw: undefined}]});
  expect(out).toBe("subscription {\n  a: 'https://y.example/sub'(clash)\n}\n");
});
