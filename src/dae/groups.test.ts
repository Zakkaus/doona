import {describe, expect, it} from 'vitest';
import {addNamesToGroup, readGroupEntries, ruleCondition, writeGroupEntry} from './groups';

const text = `global {
  lan_interface: br-lan
}

group {
    hk {
        filter: subtag('airport') && name(keyword: 'HK')
        filter: name(regex: '^Hong Kong ')
        policy: min_moving_avg
        check_url: 'https://www.gstatic.com/generate_204' # keep
        final: direct
    }
    proxy {
        filter: group('hk')
        filter: name('backup', b2)
        policy: select
        default: 'hk'
    }
}

routing {
  fallback: proxy
}
`;

describe('group entries', () => {
  it('reads each subsection with its filters and policy', () => {
    expect(readGroupEntries(text).map(e => [e.name, e.filters, e.policy])).toEqual([
      ['hk', ["subtag('airport') && name(keyword: 'HK')", "name(regex: '^Hong Kong ')"], 'min_moving_avg'],
      ['proxy', ["group('hk')", "name('backup', b2)"], 'select']
    ]);
  });

  it('rewrites filters and policy and keeps the other lines', () => {
    const next = writeGroupEntry(text, 'hk', {filters: ["subtag('airport')"], policy: 'score'});
    expect(next).toContain(
      "    hk {\n        filter: subtag('airport')\n        policy: score\n        check_url: 'https://www.gstatic.com/generate_204' # keep\n        final: direct\n    }"
    );
    expect(readGroupEntries(next)[1]).toMatchObject({name: 'proxy', policy: 'select'});
  });

  it('appends a new group and creates the section when there is none', () => {
    expect(writeGroupEntry(text, 'jp', {filters: ["name('jp-01')"], policy: 'selector'})).toContain(
      "    jp {\n        filter: name('jp-01')\n        policy: selector\n    }\n}\n\nrouting {"
    );
    expect(writeGroupEntry('global {\n  lan_interface: br-lan\n}\n', 'jp', {filters: [], policy: null})).toBe(
      'global {\n  lan_interface: br-lan\n}\n\ngroup {\n    jp {\n    }\n}\n'
    );
  });

  it('adds node names to the name filter, or adds that filter', () => {
    expect(addNamesToGroup(text, 'proxy', ['b2', 'jp 01'])).toContain("        filter: name('backup', b2, 'jp 01')\n");
    expect(addNamesToGroup(text, 'hk', ['hk-09'])).toContain(
      "        filter: name(regex: '^Hong Kong ')\n        filter: name(hk-09)\n        policy: min_moving_avg"
    );
    expect(addNamesToGroup(text, 'proxy', ['backup'])).toBe(text);
    expect(addNamesToGroup(text, 'new', ['a'])).toContain('    new {\n        filter: name(a)\n    }');
    expect(addNamesToGroup('group {\n  a { policy: score }\n}\n', 'b', ['x'])).toBe('group {\n  a { policy: score }\n  b {\n    filter: name(x)\n  }\n}\n');
  });

  it('preserves compound and qualified filters when adding a name', () => {
    for (const filter of ['name(a) && subtag(b)', 'name(a) || name(b)', 'name(keyword: a)', "name(regex: '^a')"]) {
      const source = `group { proxy { filter: ${filter} } }`;
      expect(readGroupEntries(addNamesToGroup(source, 'proxy', ['c']))[0].filters).toEqual([filter, 'name(c)']);
    }
  });

  it('extends only a complete plain call with quoted boundaries', () => {
    const source = `group { proxy { filter: name ("a)b", 'c,d', e) } }`;
    const next = addNamesToGroup(source, 'proxy', ['a)b', 'f', 'f']);
    expect(readGroupEntries(next)[0].filters).toEqual([`name("a)b", 'c,d', e, f)`]);
  });

  it('composes conditions from a kind and values', () => {
    expect(ruleCondition('domainSuffix', 'example.com, example.net')).toBe('domain(suffix: example.com, suffix: example.net)');
    expect(ruleCondition('domain', 'example.com example.net')).toBe('domain(full: example.com, full: example.net)');
    expect(ruleCondition('geosite', 'netflix, disney')).toBe('domain(geosite: netflix, geosite: disney)');
    expect(ruleCondition('geoip', 'cn us')).toBe('dip(geoip: cn, geoip: us)');
    expect(ruleCondition('dport', '80 443')).toBe('dport(80, 443)');
    expect(ruleCondition('pname', 'curl')).toBe('pname(curl)');
  });
});

it('reads and expands the one-line form', () => {
  const text = 'group {\n  proxy { policy: fixed(0) }\n  resilient { filter: name(hk-01, sg-01) policy: min_avg10 }\n}\n';
  expect(readGroupEntries(text).map(e => [e.name, e.filters, e.policy])).toEqual([
    ['proxy', [], 'fixed(0)'],
    ['resilient', ['name(hk-01, sg-01)'], 'min_avg10']
  ]);
  expect(addNamesToGroup(text, 'resilient', ['jp-01'])).toBe(
    'group {\n  proxy { policy: fixed(0) }\n  resilient {\n    filter: name(hk-01, sg-01, jp-01)\n    policy: min_avg10\n  }\n}\n'
  );
});

it('reads every group section and appends to the last', () => {
  const text = 'group {\n  a { policy: score }\n}\ngroup {\n  b {\n    filter: subtag(x)\n  }\n}\n';
  expect(readGroupEntries(text).map(e => e.name)).toEqual(['a', 'b']);
  expect(addNamesToGroup(text, 'c', ['n'])).toBe(
    'group {\n  a { policy: score }\n}\ngroup {\n  b {\n    filter: subtag(x)\n  }\n  c {\n    filter: name(n)\n  }\n}\n'
  );
});

it('edits only the named group when values and comments contain braces and hashes', () => {
  const source = `node { n: 'https://example.org/{#}' }
group { 'proxy.eu' { filter: name(regex: 'a{2}#b') policy: fixed(2) } other { policy: random } } # keep }
group {
  backup {
    filter: name("a}#b") # keep {
    policy: min_last_delay
    check_url: 'https://example.org/{#}'
  }
}
`;
  expect(readGroupEntries(source).map(entry => [entry.name, entry.filters, entry.policy])).toEqual([
    ['proxy.eu', ["name(regex: 'a{2}#b')"], 'fixed(2)'],
    ['other', [], 'random'],
    ['backup', ['name("a}#b")'], 'min_last_delay']
  ]);
  const written = addNamesToGroup(source, 'backup', ['node']);
  expect(written).toContain(source.slice(0, source.indexOf('group {\n')));
  expect(written).toContain("check_url: 'https://example.org/{#}'");
  expect(written).toContain('# keep {');
  expect(readGroupEntries(written).at(-1)).toMatchObject({filters: ['name("a}#b", node)'], policy: 'min_last_delay'});
});
