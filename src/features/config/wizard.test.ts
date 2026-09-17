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
  it('reads the subscriptions it models, keeps the rest as written, and names the first group', () => {
    const state = readState(main);
    expect(state.subscriptions.map(s => [s.name, s.url])).toEqual([
      ['sub-c', 'https://example.org/sub?token=abc'],
      ['', ''],
      ['local', 'file:///etc/honk/nodes.txt']
    ]);
    expect(state.subscriptions[1].raw).toBe('  # a file the engine reads');
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
  it('replaces routing with a template routed to the first group', () => {
    const out = writeState(main, {...readState(main), rules: 'blacklist'});
    expect(out).toContain('domain(geosite:gfw) -> proxy');
    expect(out).toContain('  fallback: direct');
    expect(out).not.toContain('dip(geoip:cn) -> direct');
    expect(out.match(/^routing \{/gm)).toHaveLength(1);
  });
  it('adds a group section only when the source has none, and generates a whole file for an empty source', () => {
    const noGroup = main.replace(/group \{[\s\S]*?\n\}\n/, '');
    const state = readState(noGroup);
    expect(state.group).toBeNull();
    expect(writeState(noGroup, state)).toContain('group {\n  proxy { policy: min_moving_avg }\n}');
    const fresh = writeState('', {subscriptions: [{name: 'sub', url: 'https://example.org/sub'}], group: null, rules: 'whitelist', lanInterface: ''});
    expect(fresh).toContain('lan_interface: auto');
    expect(fresh).toContain('      qname(geosite:cn) -> alidns\n      fallback: cloudflare');
    expect(fresh).toContain('geosite:category-games@cn) -> direct');
    expect(fresh).toContain('fallback: proxy');
  });
});
