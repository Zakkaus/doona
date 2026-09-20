import {describe, expect, it} from 'vitest';
import {addNamesToGroup, canonicalPolicy, readGroupEntries, ruleCondition, writeGroupEntry} from './groups';

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

  it('composes conditions from a kind and values', () => {
    expect(ruleCondition('domainSuffix', 'example.com, example.net')).toBe('domain(suffix: example.com, example.net)');
    expect(ruleCondition('geosite', 'cn')).toBe('domain(geosite: cn)');
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

it('reads policy spellings as the documented names', () => {
  expect(['min_moving_avg', 'fixed(0)', 'Score', null, 'honk'].map(canonicalPolicy)).toEqual(['urltest', 'selector', 'score', 'selector', 'selector']);
});
