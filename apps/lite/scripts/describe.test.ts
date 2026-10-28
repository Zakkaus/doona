import {describe, expect, it} from 'vitest';
import {describeCondition, describeGroupFilter, describeGroupFilters, describeRule, describeTarget, phraseText, policyKey} from '../src/describe';
import {catalogs} from '../src/i18n';
import {regions} from '../../../src/dae/regions';
import {rustRegexToJs} from '../../../src/dae/rustRegex';
import {quote} from '../../../src/dae/text';
import {compileFilters} from '../../../src/dae/groupFilters';
import {regionOf} from '../src/regions';
import {demoFixtures} from '../src/demo/createMockApi';

const zh = catalogs['zh-CN'];
const tw = catalogs['zh-TW'];
const en = catalogs.en;
const syntax = /group\(|name\(|subtag\(|regex:|keyword:|->|\(must\)|&&|!/;

describe('group filters', () => {
  it.each([
    ['subtag(harbor)', 'harbor 的全部节点', 'All nodes from harbor'],
    ["subtag(harbor) && name(regex: '日本')", 'harbor 中名称含“日本”的节点', 'Nodes from harbor whose names contain “日本”'],
    ['subtag(harbor) && name(keyword: 日本, keyword: JP)', 'harbor 中名称含“日本”或“JP”的节点', 'Nodes from harbor whose names contain “日本” or “JP”'],
    ["subtag(harbor) && name(regex: '(?i)jp|日本')", 'harbor 中名称含“jp”或“日本”的节点', 'Nodes from harbor whose names contain “jp” or “日本”'],
    ["subtag(harbor) && name(regex: '^JP-\\d+')", 'harbor 中名称符合自定义规则的节点', 'Nodes from harbor whose names match a custom pattern'],
    ['group(auto, hk)', '策略组：auto、hk', 'Groups: auto, hk'],
    ['name(jp-01, hk-02)', '节点：jp-01、hk-02', 'Nodes: jp-01, hk-02'],
    ["!name('direct', 'block')", '所有节点，排除直连、拦截', 'All nodes except Direct, Block'],
    ["!subtag(regex: '.*') && name('日本 01')", '手动添加的节点：日本 01', 'From manual nodes: 日本 01'],
    ['subtag(pacific) && name(香港01)', 'pacific 的节点：香港01', 'From pacific: 香港01'],
    ['name(keyword: 香港, keyword: HK)', '名称含“香港”或“HK”的节点', 'Nodes whose names contain “香港” or “HK”'],
    ['subtag(harbor) && !name(keyword: 测试)', 'harbor 的全部节点，排除名称含“测试”的节点', 'All nodes from harbor, except names containing “测试”'],
    ['subtag(keyword: air)', '订阅名称含“air”的节点', 'Nodes from subscriptions whose names contain “air”'],
    ['name(a) && && b', '自定义筛选条件', 'Custom filter']
  ])('%s', (filter, zhText, enText) => {
    const phrase = describeGroupFilter(filter)!;
    expect(phraseText(phrase, zh)).toBe(zhText);
    expect(phraseText(phrase, en)).toBe(enText);
    expect(phraseText(phrase, tw)).not.toMatch(syntax);
  });
  it('skips the empty-group placeholder and reads no filter as all nodes', () => {
    expect(describeGroupFilter("name(regex: '^$')")).toBeNull();
    expect(describeGroupFilters([]).map(item => phraseText(item, zh))).toEqual(['所有节点']);
    expect(describeGroupFilters(["name(regex: '^$')"]).map(item => phraseText(item, zh))).toEqual(['不含节点']);
  });
  it('keeps Taiwan quotes', () => {
    expect(phraseText(describeGroupFilter('name(keyword: 日本)')!, tw)).toBe('名稱含「日本」的節點');
  });
});

describe('regex literals', () => {
  it.each([
    ['日本|JP', ['日本', 'JP']],
    ['(?i)hk', ['hk']],
    ['^jp', null],
    ['a.b', null],
    ['', null]
  ])('%s', (pattern, expected) => expect(regexLiterals(pattern)).toEqual(expected));
});

describe('policies', () => {
  it.each([
    ['select', '手动选择'],
    ['fixed(0)', '手动选择'],
    ['min_moving_avg', '自动选最快'],
    ['urltest', '自动选最快'],
    ['fallback', '按顺序备用'],
    ['roundrobin', '轮流使用'],
    ['score', '按连接质量自动选'],
    [null, '手动选择']
  ])('%s', (keyword, text) => expect(zh[policyKey(keyword)]).toBe(text));
});

describe('rule conditions and targets', () => {
  it.each([
    [{kind: 'geoip', value: 'private', negate: false}, '目标 IP 所在地区：局域网'],
    [{kind: 'geosite', value: 'cn', negate: false}, '网站分类：中国大陆网站'],
    [{kind: 'geosite', value: 'category-ads-all', negate: false}, '网站分类：广告'],
    [{kind: 'qnameGeosite', value: 'cn, gfw', negate: false}, '网站分类：中国大陆网站、被封锁网站'],
    [{kind: 'geosite', value: 'google-cn, unknown-category', negate: false}, '网站分类：谷歌中国服务、unknown-category'],
    [{kind: 'geoip', value: 'cn', negate: false}, '目标 IP 所在地区：中国大陆'],
    [{kind: 'domainSuffix', value: 'example.com, example.org', negate: false}, '域名及子域名：example.com、example.org'],
    [{kind: 'dport', value: '443', negate: false}, '目标端口：443'],
    [{kind: 'l4proto', value: 'udp', negate: false}, '传输协议：UDP'],
    [{kind: 'pname', value: 'NetworkManager', negate: true}, '程序名：NetworkManager（不满足时匹配）'],
    [{kind: 'qtype', value: 'HTTPS', negate: false}, '查询类型：HTTPS']
  ])('%o', (condition, text) => expect(phraseText(describeCondition(condition), zh)).toBe(text));
  it.each([
    ['direct', '直连'],
    ['block', '拦截'],
    ['reject', '拦截'],
    ['accept', '接受结果'],
    ['asis', '原样转发'],
    ['proxy', 'proxy'],
    ['proxy(must)', 'proxy（强制）'],
    ['direct(must)', '直连（强制）']
  ])('%s', (target, text) => expect(phraseText(describeTarget(target), zh)).toBe(text));
  it('joins a rule with an arrow and no dae syntax', () => {
    const rule = describeRule(
      [
        {kind: 'geoip', value: 'private', negate: false},
        {kind: 'dport', value: '53', negate: false}
      ],
      'direct'
    );
    expect(phraseText(rule, zh)).toBe('目标 IP 所在地区：局域网 且 目标端口：53 → 直连');
    expect(phraseText(rule, en)).toBe('Destination IP region: Local network and Destination port: 53 → Direct');
    expect(phraseText(describeRule(null, 'proxy'), zh)).toBe('自定义规则 → proxy');
  });
});

import {emptyGroups, groupChanges} from '../src/groupDraft';
import {describeGroupChanges} from '../src/describe';
import {readSubscriptionBinding, regionPatterns, regexLiterals, subscriptionBinding} from '../src/groupBindings';

describe('groups review summary', () => {
  const base = 'group {\n  proxy {\n    filter: subtag(harbor)\n    policy: min_moving_avg\n  }\n}\n';
  it.each([
    ['creating a group counts once', base.replace('}\n}', () => "}\n  jp {\n    filter: name(regex: '^$')\n  }\n}"), ['添加策略组 jp']],
    ['policy', base.replace('min_moving_avg', 'fallback'), ['proxy：选择方式改为按顺序备用']],
    [
      'members',
      base.replace('subtag(harbor)', 'subtag(harbor) && name(keyword: 日本)'),
      ['proxy：加入 harbor 中名称含“日本”的节点', 'proxy：移除 harbor 的全部节点']
    ],
    ['rename', base.replace('proxy {', 'main {'), ['将策略组 proxy 重命名为 main']],
    ['delete', 'group {\n}\n', ['删除策略组 proxy']]
  ])('%s', (_, after, lines) => {
    expect(describeGroupChanges(groupChanges(base, after)).map(item => phraseText(item, zh))).toEqual(lines);
  });
  it('finds groups that would apply with no nodes', () => {
    expect(emptyGroups("group {\n  a {\n    filter: name(regex: '^$')\n  }\n  b {\n  }\n}\n")).toEqual(['a']);
  });
});

describe('subscription bindings', () => {
  it.each([
    ['harbor', [], 'subtag(harbor)'],
    ['harbor', ['日本', 'JP'], "subtag(harbor) && name(keyword: '日本', keyword: JP)"]
  ])('%s %o', (name, words, filter) => {
    const written = subscriptionBinding(name, [], words);
    expect(written.replace(/'/g, '')).toBe(filter.replace(/'/g, ''));
    expect(readSubscriptionBinding(written)).toEqual({source: name, regions: [], words});
  });
  it('reads older literal regex bindings and refuses other filters', () => {
    expect(readSubscriptionBinding("subtag(harbor) && name(regex: '日本|JP')")).toEqual({source: 'harbor', regions: [], words: ['日本', 'JP']});
    expect(readSubscriptionBinding("subtag(harbor) && name(regex: '^JP')")).toBeNull();
    expect(readSubscriptionBinding('name(jp-01)')).toBeNull();
  });
  it('round-trips regions followed by words', () => {
    const selected = ['HK', 'JP', 'IN'];
    const filter = subscriptionBinding('harbor', selected, ['IPLC', '家寬']);
    const args = [...selected.flatMap(regionPatterns).map(pattern => `regex: ${quote(pattern)}`), "keyword: 'IPLC'", "keyword: '家寬'"];
    expect(filter).toBe(`subtag('harbor') && name(${args.join(', ')})`);
    expect(readSubscriptionBinding(filter)).toEqual({source: 'harbor', regions: selected, words: ['IPLC', '家寬']});
  });
  it('reads mixed keywords, literal regexes and regions without changing their meaning', () => {
    const filter = `subtag(harbor) && name(keyword: IPLC, regex: ${quote(regionPatterns('JP')[0])}, regex: '香港|HK', regex: ${quote(regionPatterns('HK')[0])})`;
    expect(readSubscriptionBinding(filter)).toEqual({source: 'harbor', regions: ['JP', 'HK'], words: ['IPLC', '香港', 'HK']});
  });
  it.each([
    "subtag(regex: 'harbor')",
    'subtag(harbor, pacific)',
    '!subtag(harbor)',
    'subtag(harbor) && !name(keyword: IPLC)',
    "subtag(harbor) && name(keyword: IPLC, regex: '^JP')",
    "subtag(harbor) && name(keyword: IPLC, 'hk-01')",
    `subtag(harbor) && name(regex: ${quote(regionPatterns('HK')[0])}, regex: '^JP')`
  ])('does not simplify unsupported binding %s', filter => {
    expect(readSubscriptionBinding(filter)).toBeNull();
  });
  it('keeps old keyword chips as words', () => {
    expect(readSubscriptionBinding('subtag(harbor) && name(keyword: HK, keyword: 香港)')).toEqual({source: 'harbor', regions: [], words: ['HK', '香港']});
  });
  it('requires both patterns for a capitals-only region', () => {
    const patterns = regionPatterns('IN');
    expect(patterns).toHaveLength(2);
    expect(patterns[1]).toBe(String.raw`(?:^|[^\p{L}\p{M}])IN(?:[^\p{L}\p{M}]|$)`);
    for (const pattern of patterns) expect(readSubscriptionBinding(`subtag(harbor) && name(regex: ${quote(pattern)})`)).toBeNull();
    expect(readSubscriptionBinding(subscriptionBinding('harbor', ['IN'], []))).toEqual({source: 'harbor', regions: ['IN'], words: []});
  });
  it('uses the canonical Hong Kong pattern', () => {
    expect(regionPatterns('HK')).toEqual([String.raw`(?i)(?:^|[^\p{L}\p{M}])(?:hong kong|hongkong|hkg|hk)(?:[^\p{L}\p{M}]|$)|港`]);
  });
  it.each(regions)('writes valid, readable patterns for %s', iso => {
    for (const pattern of regionPatterns(iso)) {
      expect(rustRegexToJs(pattern)).not.toBeNull();
      expect(() => quote(pattern)).not.toThrow();
    }
    expect(readSubscriptionBinding(subscriptionBinding('harbor', [iso], []))).toEqual({source: 'harbor', regions: [iso], words: []});
  });
  it.each(['IN', 'IT', 'MY', 'NO', 'ID'])('matches %s only in capitals, while retaining aliases', iso => {
    const matches = compileFilters([subscriptionBinding('harbor', [iso], [])]);
    expect(matches({name: `${iso}-01`, subscription_tag: 'harbor'})).toBe(true);
    expect(matches({name: `${iso.toLowerCase()}-01`, subscription_tag: 'harbor'})).toBe(false);
    expect(matches({name: `${iso[0]}${iso[1].toLowerCase()}-01`, subscription_tag: 'harbor'})).toBe(false);
  });
  const selected = ['HK', 'TW', 'JP', 'KR', 'GB'];
  const matches = (name: string) => compileFilters([subscriptionBinding('harbor', selected, [])])({name, subscription_tag: 'harbor'});
  it.each([
    ...[
      '🇭🇰 香港 01',
      'HK-02 IPLC',
      'hk03',
      'Hong Kong 04',
      'HongKong 05',
      '香港BGP 06',
      '沪港 IPLC 07',
      'HKG 08',
      '台灣 01',
      '台湾 02',
      'TW 03',
      'Taiwan 04',
      '臺灣 05',
      '台北 06',
      '日本 01',
      'JP-02',
      '東京 03',
      '东京 04',
      'Tokyo 05',
      '韓國 01',
      '韩国 02',
      'KR 03',
      'Korea 04',
      '首爾 05',
      '英國 01',
      '英国 02',
      'UK 03',
      'London 04',
      'United Kingdom 05'
    ].map(name => [name, true] as const),
    ...[
      'UKR Kyiv 01',
      'Ukraine 02',
      'US 01',
      'Russia 01',
      'Australia 01',
      '新加坡 01',
      'Germany 01',
      'Shanghai 01',
      '剩余流量 12G',
      'SHK 07',
      'éHK',
      'HKé',
      'a\u0301HK'
    ].map(name => [name, false] as const)
  ])('selects %s: %s', (name, expected) => expect(matches(name)).toBe(expected));
  it('agrees with region detection over the demo inventory', () => {
    const names = demoFixtures.inventory.nodeFixtures(600).nodes.map(node => node.name);
    expect(names.some(matches)).toBe(true);
    for (const name of names.filter(matches)) expect(selected, name).toContain(regionOf(name));
  });
  it('combines regions and words with OR within the subscription', () => {
    const matches = compileFilters([subscriptionBinding('harbor', ['HK'], ['IPLC'])]);
    expect(matches({name: 'JP IPLC', subscription_tag: 'harbor'})).toBe(true);
    expect(matches({name: 'HK 01', subscription_tag: 'harbor'})).toBe(true);
    expect(matches({name: 'JP 01', subscription_tag: 'harbor'})).toBe(false);
    expect(matches({name: 'HK IPLC', subscription_tag: 'other'})).toBe(false);
  });
  it.each([
    ['zh-CN', 'harbor 中香港、日本的节点', 'harbor 中香港、日本或名称含“IPLC”的节点'],
    ['zh-TW', 'harbor 中香港、日本的節點', 'harbor 中香港、日本或名稱含「IPLC」的節點'],
    ['en', 'Nodes from harbor in Hong Kong, Japan', 'Nodes from harbor in Hong Kong, Japan or whose names contain “IPLC”']
  ] as const)('describes region bindings and changes in %s', (locale, regionText, mixedText) => {
    const filter = subscriptionBinding('harbor', ['HK', 'JP'], []);
    const mixed = subscriptionBinding('harbor', ['HK', 'JP'], ['IPLC']);
    expect(phraseText(describeGroupFilter(filter)!, catalogs[locale])).toBe(regionText);
    expect(phraseText(describeGroupFilter(mixed)!, catalogs[locale])).toBe(mixedText);
    const changes = describeGroupChanges([{kind: 'members', name: 'proxy', added: [mixed], removed: [filter]}]);
    expect(phraseText(changes[0], catalogs[locale])).toContain(mixedText);
    expect(phraseText(changes[1], catalogs[locale])).toContain(regionText);
  });
});

describe('condition values retain the user’s spelling', () => {
  it.each([
    [{kind: 'pname', value: '"My Browser"', negate: false}, '程序名：My Browser'],
    [{kind: 'domainRegex', value: '"^a{1,3}\\\\.example$"', negate: false}, '域名匹配规则：^a{1,3}\\.example$'],
    [{kind: 'answerGeoip', value: 'private', negate: false}, '返回 IP 所在地区：局域网'],
    [{kind: 'unrecognized', value: 'example', negate: false}, '自定义规则：example']
  ])('%o', (condition, expected) => {
    expect(phraseText(describeCondition(condition), zh)).toBe(expected);
  });
});
