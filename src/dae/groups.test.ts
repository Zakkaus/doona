import {describe, expect, it} from 'vitest';
import {
  addSubtagsToGroup,
  removeSubtagsFromGroup,
  groupsNamingTag,
  groupNameProblem,
  classifyFilters,
  describeFilters,
  readGroupEntries,
  ruleCondition,
  dnsConditionKinds,
  writeGroupEntry,
  nameText,
  nestedIn
} from './groups';
import {groupAdmits} from './groupFilters';

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
    expect(readGroupEntries(next)[0]).toMatchObject({name: 'hk', policy: 'score'});
  });

  it('reads default and final as written and the groups an entry nests', () => {
    expect(readGroupEntries(text).map(e => [e.name, e.default, e.final, nestedIn(e)])).toEqual([
      ['hk', null, 'direct', []],
      ['proxy', "'hk'", null, ['hk']]
    ]);
    expect(nestedIn({filters: ["group('a,b')"]})).toEqual(['a', 'b']);
    expect(nestedIn({filters: ["group('a', b|c) && name(x)", 'name(group)', 'group()']})).toEqual(['a', 'b', 'c']);
  });

  it('sets, replaces and removes default and final, and leaves them alone when not given', () => {
    const set = writeGroupEntry(text, 'hk', {filters: readGroupEntries(text)[0].filters, policy: 'min_moving_avg', default: "'jp 01'", final: 'block'});
    expect(set).toContain(
      "        policy: min_moving_avg\n        default: 'jp 01'\n        check_url: 'https://www.gstatic.com/generate_204' # keep\n        final: block\n    }"
    );
    const cleared = writeGroupEntry(text, 'proxy', {filters: ["group('hk')", "name('backup', b2)"], policy: 'select', default: null, final: 'hk'});
    expect(cleared).toContain('        policy: select\n        final: hk\n    }');
    expect(writeGroupEntry(text, 'proxy', {filters: ["group('hk')", "name('backup', b2)"], policy: 'select'})).toBe(text);
    expect(writeGroupEntry('group {\n  g {\n    check_url: x\n  }\n}\n', 'g', {filters: [], policy: null, final: 'direct'})).toBe(
      'group {\n  g {\n    final: direct\n    check_url: x\n  }\n}\n'
    );
  });

  it('round-trips interruption and edits it without moving comments or other fields', () => {
    const source = "group {\n  g {\n    policy: select\n    interrupt_connections: 'true' # keep\n    check_url: x\n  }\n}\n";
    const unchanged = {filters: [], policy: 'select'};
    expect(readGroupEntries(source)[0]).toMatchObject({interrupt: "'true'"});
    expect(writeGroupEntry(source, 'g', unchanged)).toBe(source);
    expect(writeGroupEntry(source, 'g', {...unchanged, interrupt: 'false'})).toBe(source.replace("'true'", 'false'));
    expect(writeGroupEntry(source, 'g', {...unchanged, interrupt: null})).toBe(source.replace("interrupt_connections: 'true'", ''));
    const absent = 'group {\n  g {\n    policy: select\n    check_url: x\n  }\n}\n';
    const added = writeGroupEntry(absent, 'g', {...unchanged, interrupt: 'true'});
    expect(added).toBe(absent.replace('    check_url:', '    interrupt_connections: true\n    check_url:'));
    expect(writeGroupEntry(added, 'g', {...unchanged, interrupt: null})).toBe(absent);
    expect(writeGroupEntry('group { g { policy: select interrupt_connections: true } }', 'g', {...unchanged, interrupt: 'false'})).toContain(
      '    policy: select\n    interrupt_connections: false\n'
    );
    expect(writeGroupEntry('', 'g', {...unchanged, interrupt: 'true'})).toContain('interrupt_connections: true');
  });

  it('writes a name back as it was written while it names the same value', () => {
    expect(nameText('hk', "'hk'")).toBe("'hk'");
    expect(nameText('jp 01', "'hk'")).toBe("'jp 01'");
    expect(nameText('direct', null)).toBe('direct');
    expect(nameText(null, "'hk'")).toBeNull();
  });

  it('appends a new group and creates the section when there is none', () => {
    expect(writeGroupEntry(text, 'jp', {filters: ["name('jp-01')"], policy: 'selector'})).toContain(
      "    jp {\n        filter: name('jp-01')\n        policy: selector\n    }\n}\n\nrouting {"
    );
    expect(writeGroupEntry('global {\n  lan_interface: br-lan\n}\n', 'jp', {filters: [], policy: null})).toBe(
      'global {\n  lan_interface: br-lan\n}\n\ngroup {\n    jp {\n    }\n}\n'
    );
  });

  it('composes conditions from a kind and values', () => {
    expect(ruleCondition('domainSuffix', 'example.com, example.net')).toBe('domain(suffix: example.com, suffix: example.net)');
    expect(ruleCondition('domain', 'example.com example.net')).toBe('domain(full: example.com, full: example.net)');
    expect(ruleCondition('domainKeyword', 'tracker, ads')).toBe('domain(keyword: tracker, keyword: ads)');
    expect(ruleCondition('geosite', 'netflix, disney')).toBe('domain(geosite: netflix, geosite: disney)');
    expect(ruleCondition('geoip', 'cn us')).toBe('dip(geoip: cn, geoip: us)');
    expect(ruleCondition('dport', '80 443')).toBe('dport(80, 443)');
    expect(ruleCondition('pname', 'curl')).toBe('pname(curl)');
  });
  it('composes DNS conditions in the qname, qtype, upstream and ip forms honk reads', () => {
    expect(ruleCondition('qnameSuffix', 'lan home.arpa')).toBe('qname(suffix: lan, suffix: home.arpa)');
    expect(ruleCondition('qnameFull', 'dns.google')).toBe('qname(full: dns.google)');
    expect(ruleCondition('qnameKeyword', 'tracker')).toBe('qname(keyword: tracker)');
    expect(ruleCondition('qnameGeosite', 'cn')).toBe('qname(geosite: cn)');
    expect(ruleCondition('qtype', 'A, AAAA')).toBe('qtype(A, AAAA)');
    expect(ruleCondition('upstream', 'alidns')).toBe('upstream(alidns)');
    expect(ruleCondition('answerIp', '0.0.0.0/32, ::/128')).toBe("ip(0.0.0.0/32, '::/128')");
    expect(ruleCondition('answerGeoip', 'private')).toBe('ip(geoip: private)');
    expect(dnsConditionKinds.request).not.toContain('upstream');
    expect(dnsConditionKinds.response).toEqual(expect.arrayContaining(dnsConditionKinds.request));
  });
  it('quotes a value with a colon and refuses one the rule grammar would read as syntax', () => {
    expect(ruleCondition('dip', '2001:db8::1, 10.0.0.0/8')).toBe("dip('2001:db8::1', 10.0.0.0/8)");
    expect(ruleCondition('dport', '8000-9000')).toBe('dport(8000-9000)');
    expect(ruleCondition('pname', 'caf\u00e9')).toBe('pname(caf\u00e9)');
    expect(ruleCondition('pname', 'a&&b')).toBeNull();
    expect(ruleCondition('pname', 'app(1)')).toBeNull();
    expect(ruleCondition('domain', 'a&&b.example')).toBeNull();
    expect(ruleCondition('pname', "it's")).toBeNull();
  });
});

it('reads and expands the one-line form', () => {
  const text = 'group {\n  proxy { policy: fixed(0) }\n  auto { filter: name(hk-01, sg-01) policy: min_avg10 }\n}\n';
  expect(readGroupEntries(text).map(e => [e.name, e.filters, e.policy])).toEqual([
    ['proxy', [], 'fixed(0)'],
    ['auto', ['name(hk-01, sg-01)'], 'min_avg10']
  ]);
  expect(writeGroupEntry(text, 'auto', {filters: ['name(hk-01, sg-01, jp-01)'], policy: 'min_avg10'})).toBe(
    'group {\n  proxy { policy: fixed(0) }\n  auto {\n    filter: name(hk-01, sg-01, jp-01)\n    policy: min_avg10\n  }\n}\n'
  );
});

it('keeps the order of the other fields when it spreads a one-line entry', () => {
  const text = "group {\n  g { check_url: 'https://example.org' filter: name(a) policy: min check_interval: 30s }\n}\n";
  expect(writeGroupEntry(text, 'g', {filters: ['name(a, b)'], policy: 'random'})).toBe(
    "group {\n  g {\n    check_url: 'https://example.org'\n    filter: name(a, b)\n    policy: random\n    check_interval: 30s\n  }\n}\n"
  );
});

it('reads every group section and appends to the last', () => {
  const text = 'group {\n  a { policy: score }\n}\ngroup {\n  b {\n    filter: subtag(x)\n  }\n}\n';
  expect(readGroupEntries(text).map(e => e.name)).toEqual(['a', 'b']);
  expect(writeGroupEntry(text, 'c', {filters: ['name(n)'], policy: null})).toBe(
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
  const written = writeGroupEntry(source, 'backup', {filters: ['name("a}#b", node)'], policy: 'min_last_delay'});
  expect(written).toContain(source.slice(0, source.indexOf('group {\n')));
  expect(written).toContain("check_url: 'https://example.org/{#}'");
  expect(written).toContain('# keep {');
  expect(readGroupEntries(written).at(-1)).toMatchObject({filters: ['name("a}#b", node)'], policy: 'min_last_delay'});
});

describe('group edits keep the rest of the source intact', () => {
  it('replaces a filter that spans several lines as one value', () => {
    const text = 'group {\n  hk {\n    filter: name(\n      a,\n      b)\n    policy: min\n  }\n}\n';
    const next = writeGroupEntry(text, 'hk', {filters: ["name('c')"], policy: 'fixed(0)'});
    expect(next).toBe("group {\n  hk {\n    filter: name('c')\n    policy: fixed(0)\n  }\n}\n");
  });

  it('removes whole lines in a file with CRLF line endings', () => {
    const text = 'group {\r\n  hk {\r\n    filter: name(a)\r\n    policy: min\r\n  }\r\n}\r\n';
    const once = writeGroupEntry(text, 'hk', {filters: ['name(b)'], policy: 'min'});
    const twice = writeGroupEntry(once, 'hk', {filters: ['name(c)'], policy: 'min'});
    expect(twice.split('\n').filter(line => /^[ \t\r]*$/.test(line) && line !== '').length).toBe(0);
    expect(twice).toContain('filter: name(c)');
    expect(twice).not.toContain('name(b)');
  });
});

it('quotes IPv6 ranges in address rules and leaves IPv4 bare', () => {
  expect(ruleCondition('dip', '10.0.0.0/8, ff00::/8')).toBe("dip(10.0.0.0/8, 'ff00::/8')");
  expect(ruleCondition('sip', '2001:db8::1')).toBe("sip('2001:db8::1')");
});

it('returns no condition for a value that cannot be quoted instead of throwing', () => {
  expect(ruleCondition('dip', "2001:db8::'1")).toBeNull();
});

it('returns no condition for a picked value that would escape the rule line', () => {
  expect(ruleCondition('domainSuffix', 'a) # x')).toBeNull();
  expect(ruleCondition('pname', 'a->b')).toBeNull();
});

describe('subscription group edits preserve other filters', () => {
  it('classifies each filter line', () => {
    const [hk, proxy] = readGroupEntries(text);
    expect(classifyFilters(hk)).toEqual({names: [], subtags: [], rules: ["subtag('airport') && name(keyword: 'HK')", "name(regex: '^Hong Kong ')"]});
    expect(classifyFilters(proxy)).toEqual({names: ['backup', 'b2'], subtags: [], rules: ["group('hk')"]});
  });

  it('adds an exact subscription list', () => {
    expect(readGroupEntries(addSubtagsToGroup(text, 'proxy', ['sub-a']))[1].filters).toEqual(["group('hk')", "name('backup', b2)", 'subtag(sub-a)']);
  });
});

it('reads bare non-ASCII names as exact, as honk does', () => {
  // A CJK name, built at runtime because the i18n check refuses CJK literals in source.
  const hong = String.fromCodePoint(0x9999, 0x6e2f) + '01';
  const source = `group {\n    hk {\n        filter: name(${hong}, hk-02)\n    }\n}\n`;
  const [hk] = readGroupEntries(source);
  expect(classifyFilters(hk).names).toEqual([hong, 'hk-02']);
});

describe('group filters decide membership as honk does', () => {
  const hk = {name: 'HK 01', subscription_tag: 'airport'};
  const jp = {name: 'JP 01', subscription_tag: 'airport'};
  const own = {name: 'home', subscription_tag: null};
  it('joins lines with OR and terms with AND', () => {
    const filters = ["subtag('airport') && name(keyword: 'HK')", 'name(home)'];
    expect([hk, jp, own].map(node => groupAdmits(filters, node))).toEqual([true, false, true]);
  });
  it('negates, matches regexes and ignores lines it cannot read', () => {
    expect(groupAdmits(["subtag(airport) && !name(regex: '^HK')"], hk)).toBe(false);
    expect(groupAdmits(["subtag(airport) && !name(regex: '^HK')"], jp)).toBe(true);
    expect(groupAdmits(['nonsense(x)', 'name(home)'], own)).toBe(true);
    expect(groupAdmits(['nonsense(x)'], own)).toBe(false);
    expect(groupAdmits(["!subtag(regex: '.*')"], own)).toBe(true);
    expect(groupAdmits(["subtag(regex: '.*')"], own)).toBe(false);
  });
  it.each([
    ["name(regex: '\\p{Han}')", String.fromCodePoint(0x9999, 0x6e2f) + '01', true],
    ["name(regex: '\\p{Han}')", 'HK 01', false],
    ["name(regex: '(?i)^\\pL+ \\d')", 'hk 01', true],
    ["name(regex: '^\\\\pL')", 'HK 01', false]
  ])('matches Unicode regex %s against %s', (filter, name, admitted) => {
    expect(groupAdmits([filter], {name, subscription_tag: null})).toBe(admitted);
  });
  it('holds every node without a filter, none with only subgroups, and a built-in only by exact name', () => {
    expect(groupAdmits([], jp)).toBe(true);
    expect(groupAdmits(["group('hk')"], jp)).toBe(false);
    expect(groupAdmits([], {name: 'direct', subscription_tag: null})).toBe(false);
    expect(groupAdmits(["name(keyword: 'dir')"], {name: 'direct', subscription_tag: null})).toBe(false);
    expect(groupAdmits(['name(direct)'], {name: 'direct', subscription_tag: null})).toBe(true);
  });
});

it('accepts only bare, unused names for a new group', () => {
  const taken = new Set(['proxy']);
  expect(groupNameProblem('hk.auto-1', taken)).toBeNull();
  expect(groupNameProblem('proxy', taken)).toBe('taken');
  expect(groupNameProblem('hk auto', taken)).toBe('invalid');
  expect(groupNameProblem('', taken)).toBe('invalid');
});

it('keeps a comment inside a multi-line filter within that filter and the rest of the file unchanged', () => {
  const before = 'group {\n  hk {\n';
  const filter = 'name(a,\n      # keep\n      b)';
  const after = '\n    policy: select\n  }\n}\n';
  const source = `${before}    filter: ${filter}${after}`;
  expect(readGroupEntries(source)[0].filters).toEqual([filter]);
  expect(writeGroupEntry(source, 'hk', {filters: [filter, 'name(c)'], policy: 'select'})).toBe(`${before}    filter: ${filter}\n    filter: name(c)${after}`);
});

it('edits a group in place and keeps its comments, other fields and the rest of the file byte-identical', () => {
  const head = 'global {\n  lan_interface: br-lan\n}\n\ngroup {\n  hk {\n    # primary\n    check_url: x\n    filter: ';
  const tail = '\n    # set by hand\n    policy: select # pick\n    final: direct\n  }\n}\n';
  const source = `${head}name(a)${tail}`;
  expect(writeGroupEntry(source, 'hk', {filters: ['name(b)', 'name(c)'], policy: 'select'})).toBe(`${head}name(b)\n    filter: name(c)${tail}`);
  expect(writeGroupEntry(source, 'hk', {filters: ['name(a)'], policy: 'min'})).toBe(source.replace('policy: select', 'policy: min'));
});

it('names the groups whose filters cite a subscription tag, exactly or inside an expression', () => {
  const text = `group {
  exact { filter: subtag(sub-x) policy: min }
  quoted { filter: subtag('sub-x', other) }
  compound { filter: subtag(sub-x) && !name(keyword: HK) }
  negated { filter: !subtag(sub-x) }
  unrelated { filter: subtag(sub-y) filter: name(hk-01) }
}
`;
  expect(groupsNamingTag(text, 'sub-x')).toEqual(['exact', 'quoted', 'compound', 'negated']);
  expect(groupsNamingTag(text, 'sub-z')).toEqual([]);
});

it.each([
  {group: 'streaming', final: undefined, header: 'streaming', finalLine: ''},
  {group: 'streaming', final: 'direct', header: 'streaming', finalLine: '        final: direct\n'},
  {group: 'streaming list', final: "'US 01'", header: "'streaming list'", finalLine: "        final: 'US 01'\n"}
])('creates $group with final $final through the group writer', ({group, final, header, finalLine}) => {
  const next = writeGroupEntry('group {\n}\n', group, {filters: ['name(hk-01)'], policy: 'select', final});
  expect(next).toBe(`group {\n    ${header} {\n        filter: name(hk-01)\n        policy: select\n${finalLine}    }\n}\n`);
  expect(readGroupEntries(next)[0]).toMatchObject({name: group, filters: ['name(hk-01)'], policy: 'select', final: final ?? null});
});

it('describes complete template filters and preserves other filter expressions', () => {
  expect(describeFilters(["group('auto', 'hk|jp')", "!name('direct', 'block')"])).toEqual({everyNode: true, groups: ['auto', 'hk', 'jp'], rules: []});
  expect(describeFilters([' ! name( block , direct ) ']).everyNode).toBe(true);
  for (const filter of [
    "!name('direct')",
    "!name('direct', 'block', 'hk-01')",
    "!name('direct', 'direct')",
    "!name(keyword: 'direct', 'block')",
    "!name('direct', 'block') && subtag(harbor)",
    "group('hk') && name(keyword: 'hk')",
    "name(regex: '^jp')"
  ]) {
    expect(describeFilters([filter])).toEqual({everyNode: false, groups: [], rules: [filter]});
  }
  expect(describeFilters([])).toEqual({everyNode: false, groups: [], rules: []});
});

it('inserts before a filter sharing the opening line inside its group', () => {
  const source = 'group {\n  g { filter: name(a) # keep\n    filter: name(b)\n    policy: select\n  }\n}\n';
  const output = writeGroupEntry(source, 'g', {filters: ['name(c)', 'name(a)'], policy: 'select'});
  expect(readGroupEntries(output)[0].filters).toEqual(['name(c)', 'name(a)']);
  expect(output).toContain('filter: name(a) # keep\n');
  expect(output.indexOf('filter: name(c)')).toBeGreaterThan(output.indexOf('g {'));
});

it('keeps inserted filters inside mixed opening and closing lines', () => {
  for (const source of [
    'group {\n  g { policy: select\n  }\n}\n',
    'group {\n  g { filter: name(a)\n    filter: name(b) } }',
    'group {\n  g { filter: name(a)\n    filter: name(b) } }\n'
  ]) {
    const output = writeGroupEntry(source, 'g', {filters: ['name(c)', 'name(a)', 'name(d)'], policy: 'select'});
    expect(readGroupEntries(output)[0]).toMatchObject({filters: ['name(c)', 'name(a)', 'name(d)'], policy: 'select'});
  }
});

it('edits the last declaration across group sections and keeps its own filters when adding a subscription', () => {
  const earlier = 'dup { filter: name(old) policy: min final: direct }';
  const source = `group { ${earlier} }
group { dup { filter: name(current) policy: select final: block } }`;
  const written = writeGroupEntry(source, 'dup', {filters: ['name(current)'], policy: 'score', final: 'direct'});
  expect(written).toContain(earlier);
  expect(readGroupEntries(written).map(entry => entry.policy)).toEqual(['min', 'score']);
  const reverted = writeGroupEntry(source, 'dup', {filters: ['name(old)'], policy: 'min', final: 'direct'});
  expect(reverted).toContain(earlier);
  expect(readGroupEntries(reverted).at(-1)).toMatchObject({filters: ['name(old)'], policy: 'min', final: 'direct'});
  const added = addSubtagsToGroup(source, 'dup', ['new']);
  expect(added).toContain(earlier);
  expect(readGroupEntries(added).at(-1)).toMatchObject({filters: ['name(current)', 'subtag(new)'], policy: 'select', final: 'block'});
});

it.each([
  ['renames inside a spaced list', "subtag(  'old', keep  )", ['subtag(  keep, new  )']],
  ['leaves an untouched second list byte for byte', 'subtag(old)\n            filter: subtag(  untouched  )', ['subtag(new)', 'subtag(  untouched  )']],
  ['keeps the separator style of remaining values', 'subtag(a ,old,  b)', ['subtag(a ,b, new)']],
  ['skips an empty list before the one holding the value', 'subtag()\n            filter: subtag(old)', ['subtag()', 'subtag(new)']]
])('splices a subscription rename into exact filters: %s', (_, filters, expected) => {
  const source = `group {\n    g {\n        filter: ${filters}\n        policy: min\n    }\n}\n`;
  const renamed = removeSubtagsFromGroup(addSubtagsToGroup(source, 'g', ['new']), 'g', ['old']);
  expect(readGroupEntries(renamed)[0].filters).toEqual(expected);
});
