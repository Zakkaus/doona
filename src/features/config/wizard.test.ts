import {describe, expect, it} from 'vitest';
import {readState, writeState} from './wizard';

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
  it('adds a group section only when the source has none, and generates a whole file for an empty source', () => {
    // A group name outside [\w-] is still the routing target, and its section is still left alone.
    const odd = main.replace('  proxy {', '  proxy.eu {');
    expect(readState(odd).group).toBe('proxy.eu');
    const written = writeState(odd, {...readState(odd), rules: 'global'});
    expect(written).toContain('  proxy.eu {\n    filter: name(hk-01, sg-01)');
    expect(written).toContain('fallback: proxy.eu');
    const noGroup = main.replace(/group \{[\s\S]*?\n\}\n/, '');
    const state = readState(noGroup);
    expect(state.group).toBeNull();
    expect(writeState(noGroup, state)).toContain("group {\n  proxy { filter: !name('direct', 'block') policy: min_moving_avg }\n}");
    const fresh = writeState('', {subscriptions: [{name: 'sub', url: 'https://example.org/sub'}], group: null, rules: 'keep', lanInterface: ''});
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
