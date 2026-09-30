import {expect, it} from 'vitest';
import type {PendingRule} from '../../store';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {ruleLine} from '../../dae/ruleText';
import {
  acceptedRule,
  answerAddresses,
  answeredUpstream,
  conditionKey,
  dnsActions,
  dnsRulePositions,
  dnsUpstreamChoices,
  duplicateOf,
  pinnedPosition,
  quickRuleContext,
  ruleDialogReason,
  ruleLists,
  ruleOutbounds,
  rulePositions,
  ruleTargets,
  ruleWritable,
  ruleWritten,
  typedCondition,
  type QuickRuleSeed
} from './rule';
const t: Translator = (key, params) => translate('en', key, params);

it('offers the exact domain first, then its subdomains, the destination IP and the source IP as one host', () => {
  const text = (c: {domain?: string | null; dip?: string | null; sip?: string | null}) =>
    ruleTargets({domain: c.domain ?? null, dip: c.dip ?? null, sip: c.sip ?? null}).map(target => ruleLine(target.condition, 'proxy'));
  expect(text({domain: 'api.telegram.org.', dip: '149.154.167.220', sip: '192.168.1.20'})).toEqual([
    'domain(full: api.telegram.org) -> proxy',
    'domain(suffix: api.telegram.org) -> proxy',
    'dip(149.154.167.220/32) -> proxy',
    'sip(192.168.1.20/32) -> proxy'
  ]);
  expect(ruleTargets({domain: 'api.telegram.org', dip: null, sip: null}).map(target => target.kind)).toEqual(['domain', 'domainSuffix']);
  expect(text({dip: '2001:db8::5'})).toEqual(["dip('2001:db8::5/128') -> proxy"]);
  // A domain dae cannot hold is left out; the addresses are still offered.
  expect(text({domain: "it's.example", dip: '1.1.1.1'})).toEqual(['dip(1.1.1.1/32) -> proxy']);
  expect(text({})).toEqual([]);
});

it('compares conditions however they are spaced, quoted or displayed with their outbound', () => {
  expect(conditionKey('pname(curl) -> direct')).toBe(conditionKey('pname( curl )'));
  expect(conditionKey("dip('2001:db8::5/128') -> proxy(must)")).toBe(conditionKey('dip("2001:db8::5/128")'));
  expect(conditionKey('dip(1.1.1.1)')).not.toBe(conditionKey('dip(1.1.1.1/32)'));
  // The target however the list spells it: with or without spaces or `(must)`, bare or quoted.
  for (const shown of ['->x', '-> x', '-> x(must)', '->x(must)', "-> 'my group'", '->"my group"(must)', '-> hk-1.a']) {
    expect(conditionKey(`pname(curl) ${shown}`)).toBe(conditionKey('pname(curl)'));
  }
});

it('inserts before a vouched-for matched rule, else before the fallback, and only where the source can be written', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  const hit = (id: string, expression: string | null = null) => ({id, expression});
  const ids = (matched: {id: string; expression: string | null} | null, list = sources) =>
    rulePositions(rules, list, matched, t).map(position => [position.id, position.label]);
  expect(ids(hit('r5', r5.expression))).toEqual([
    ['r5', 'Before the matched rule'],
    ['fallback', 'Last, before the fallback'],
    ['r1', 'First']
  ]);
  expect(rulePositions(rules, sources, hit('r5'), t)[0]).toMatchObject({desc: 'domain(geosite: telegram)', matched: true, first: false});
  expect(ids(hit('r1'))).toEqual([
    ['r1', 'Before the matched rule'],
    ['fallback', 'Last, before the fallback']
  ]);
  expect(ids(null)).toEqual([
    ['fallback', 'Last, before the fallback'],
    ['r1', 'First']
  ]);
  expect(ids(hit('gone'))).toEqual(ids(null));
  // A match recorded against a rule that now reads differently is not trusted.
  expect(ids(hit('r5', 'dip(9.9.9.9)'))).toEqual(ids(null));
  expect(ids(hit('fallback'))).toEqual([
    ['fallback', 'Before the matched rule'],
    ['r1', 'First']
  ]);
  // A rule in a read-only include is not offered; the others still are.
  const readOnly = sources.map(source => (source.id === 'src-rules' ? {...source, writable: false} : source));
  expect(ids(hit('r7'), readOnly)).toEqual(ids(null));
  expect(
    ids(
      hit('r7'),
      sources.map(source => ({...source, writable: false}))
    )
  ).toEqual([]);
});

it('places rules the contract displays with their outbound, and falls back to the earliest writable rule', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const ids = (list: typeof rules, matched: string | null, from = sources) =>
    rulePositions(list, from, matched === null ? null : {id: matched, expression: null}, t).map(position => [position.id, position.label]);
  // The contract shows `pname(curl) -> direct`; honk sends the condition alone. Both name the same line.
  const shown = rules.map(rule => (rule.kind === 'rule' ? {...rule, expression: ruleLine(rule.expression, rule.outbound, rule.must)} : rule));
  expect(ids(shown, 'r5')).toEqual(ids(rules, 'r5'));
  expect(ids(shown, 'r5')).toHaveLength(3);
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  expect(rulePositions(shown, sources, {id: 'r5', expression: r5.expression}, t)[0].matched).toBe(true);
  // With the first rule in a file doona cannot write, the earliest rule it can write before is offered instead.
  const main = sources.find(source => source.id === 'src-main')!;
  const locked = [...sources, {...main, id: 'src-locked', writable: false}];
  const lockedFirst = rules.map(rule => (rule === rules[0] ? {...rule, source: {...rule.source!, source_id: 'src-locked'}} : rule));
  expect(ids(lockedFirst, null, locked)).toEqual([
    ['fallback', 'Last, before the fallback'],
    [rules[1].rule_id, 'Before rule 2']
  ]);
  expect(ids(lockedFirst, rules[0].rule_id, locked)).toEqual(ids(lockedFirst, null, locked));
});

it('keeps the pinned position while its rule exists and reports it moved after a reload removed it', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const positions = rulePositions(rules, sources, {id: 'r5', expression: null}, t);
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  const pin = {generation: '40', id: r5.rule_id, desc: r5.expression};
  expect(pinnedPosition(positions, null, '40')).toEqual({before: 'r5', moved: false});
  expect(pinnedPosition(positions, pin, '40')).toEqual({before: 'r5', moved: false});
  expect(pinnedPosition(positions, {...pin, id: 'r1'}, '40')).toEqual({before: 'r1', moved: false});
  const reloaded = rulePositions(
    rules.filter(rule => rule.rule_id !== 'r5'),
    sources,
    {id: 'r5', expression: null},
    t
  );
  expect(pinnedPosition(reloaded, pin, '41')).toEqual({before: 'fallback', moved: true});
  // The same id in a new generation is the same rule only if it still reads the same.
  const renumbered = rulePositions(
    rules.map(rule => (rule.rule_id === 'r5' ? {...rule, expression: 'dip(9.9.9.9)'} : rule)),
    sources,
    null,
    t
  );
  expect(pinnedPosition(renumbered, pin, '41').moved).toBe(true);
});

it('says the add-rule dialog is loading while what it needs is read, then that an outbound is missing', () => {
  const idle = {readOnly: false, waiting: true, outbound: false, busy: false, failed: false, unplaceable: false};
  expect(ruleDialogReason({...idle, readOnly: true}, t)).toBe('Configuration writes are unavailable here. Copy the rule instead.');
  expect(ruleDialogReason(idle, t)).toBe('Loading…');
  expect(ruleDialogReason({...idle, waiting: false}, t)).toBe('Choose an outbound');
  expect(ruleDialogReason({...idle, waiting: false, outbound: true}, t)).toBeNull();
  // A failed read and a missing position have their own notices in the dialog; a write in flight shows as pending.
  expect(ruleDialogReason({...idle, failed: true}, t)).toBeNull();
  expect(ruleDialogReason({...idle, unplaceable: true}, t)).toBeNull();
  expect(ruleDialogReason({...idle, busy: true}, t)).toBeNull();
});

it('offers editing a matched rule only when doona can locate it in a writable source', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const rule = rules.find(rule => rule.rule_id === 'r5')!;
  expect(ruleWritable(rule, sources)).toBe(true);
  expect(ruleWritable(undefined, sources)).toBe(false);
  // An implicit fallback has no source to write.
  expect(ruleWritable({...rule, source: null}, sources)).toBe(false);
  expect(
    ruleWritable(
      rule,
      sources.map(source => ({...source, writable: false}))
    )
  ).toBe(false);
});

it('finds the rule a write added in the reloaded list, the nearest before the rule it went before in its source', async () => {
  const api = createMockApi();
  const {rules} = await api.rules();
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  const added = (id: string, index: number, source = r5.source) => ({
    ...r5,
    rule_id: id,
    index,
    source,
    expression: 'domain(full: a.example)',
    outbound: 'proxy'
  });
  const at = rules.indexOf(r5);
  // The same rule held twice: once first in the list, once before the rule it was placed in front of.
  const reloaded = [added('n1', 0), ...rules.slice(0, at), added('n2', at), ...rules.slice(at)];
  expect(acceptedRule(reloaded, 'domain(full: a.example)', 'proxy', r5)).toBe('n2');
  expect(acceptedRule(reloaded, 'domain(full: a.example)', 'proxy', {...r5, expression: 'dip(9.9.9.9)'})).toBe('n1');
  expect(acceptedRule(reloaded, 'domain(full: a.example)', 'direct', r5)).toBeNull();
  expect(acceptedRule(rules, 'domain(full: a.example)', 'proxy', r5)).toBeNull();
  // Another write landed between the added rule and its anchor; a copy in another source does not count.
  const other = {...r5.source!, source_id: 'elsewhere'};
  const between = [added('n1', 0), ...rules.slice(0, at), added('n2', at), rules[0], added('n3', at, other), ...rules.slice(at)];
  expect(acceptedRule(between, 'domain(full: a.example)', 'proxy', r5)).toBe('n2');
});

it('names where the same condition and outbound already is, listed before held, and nothing for another outbound', async () => {
  const api = createMockApi();
  const {rules} = await api.rules();
  const r5 = rules.find(rule => rule.rule_id === 'r5')!;
  const held: PendingRule[] = [
    {list: 'routing', id: 1, condition: 'domain(full: a.example)', outbound: 'proxy', must: false, before: r5, sourceId: 'src-main'}
  ];
  const listed = rules.map(rule => ({...rule, target: rule.outbound ?? ''}));
  expect(duplicateOf('routing', listed, held, r5.expression, r5.outbound!, t)).toBe(`Rule ${r5.index + 1} already has the same condition and outbound.`);
  expect(duplicateOf('routing', listed, held, 'domain( full: a.example )', 'proxy', t)).toBe('A held rule already has the same condition and outbound.');
  expect(duplicateOf('routing', listed, held, 'domain(full: a.example)', 'direct', t)).toBeNull();
  // A DNS rule held with the same text is in another list.
  expect(duplicateOf('routing', listed, [{...held[0], list: 'request', before: null}], 'domain(full: a.example)', 'proxy', t)).toBeNull();
  expect(duplicateOf('routing', listed, [], 'domain(full: b.example)', 'proxy', t)).toBeNull();
});

it('starts a DNS origin in the DNS lists: the name for a request, each answered A or AAAA address for a response', () => {
  const seed: QuickRuleSeed = {
    domain: 'api.telegram.org.',
    dip: null,
    sip: '10.0.0.12',
    outbound: null,
    matched: null,
    dns: {
      type: 'A',
      answers: answerAddresses([
        {type: 'CNAME', data: 'edge.telegram.org.'},
        {type: 'A', data: '149.154.167.99'},
        {type: 'AAAA', data: '2001:67c:4e8::a'}
      ]),
      upstream: null,
      query: {name: 'api.telegram.org.', type: 'A'}
    }
  };
  expect(ruleLists(seed, true)).toEqual(['request', 'response', 'routing']);
  expect(ruleLists(seed, false)).toEqual(['routing']);
  expect(ruleLists({...seed, dns: undefined}, true)).toEqual(['routing']);
  expect(ruleTargets(seed, 'request').map(target => target.condition)).toEqual([
    'qname(full: api.telegram.org)',
    'qname(suffix: api.telegram.org)',
    'sip(10.0.0.12/32)'
  ]);
  expect(ruleTargets(seed, 'response').map(target => target.condition)).toEqual(['ip(149.154.167.99/32)', "ip('2001:67c:4e8::a/128')", 'sip(10.0.0.12/32)']);
  // Without an answered address a response rule would only match the client, so the list is not offered.
  expect(ruleLists({...seed, dns: {...seed.dns!, answers: []}}, true)).toEqual(['request', 'routing']);
  expect(typedCondition('qname(full: a.example)', 'AAAA')).toBe('qname(full: a.example) && qtype(AAAA)');
  expect(typedCondition('qname(full: a.example)', null)).toBe('qname(full: a.example)');
});

it('places a DNS rule before a written fallback, else at the list end, in a new block when the list has none', async () => {
  const api = createMockApi();
  const [dns, {sources}] = await Promise.all([api.dnsRules(), api.config()]);
  expect(dnsRulePositions('request', dns.request, sources, t).map(position => position.label)).toEqual(['Last, before the fallback', 'First']);
  const main = sources.find(source => source.id === 'src-main')!;
  const unfinished = main.content!.replace('      fallback: accept\n', '');
  const listed = dns.response.filter(rule => rule.kind === 'rule');
  expect(dnsRulePositions('response', listed, [{...main, content: unfinished}], t).map(position => position.label)).toEqual(['Last', 'First']);
  const content = main.content!.replace(/ {4}response \{\n[\s\S]*? {4}\}\n/, '');
  const unwritten = {...dns.response[0], rule_id: 'response:fallback', kind: 'fallback' as const, source: null, expression: 'fallback: accept'};
  const absent = dnsRulePositions('response', [unwritten], [{...main, content}], t);
  expect(absent).toEqual([
    {id: 'end', label: 'New response block, as its first rule', desc: t('rule.dns.positionNewHelp', {name: 'response'}), first: false, matched: false}
  ]);
  // With no dns routing section, or with two, there is no place; nor in a file doona cannot write.
  expect(dnsRulePositions('response', [unwritten], [{...main, content: 'routing {\n  fallback: direct\n}\n'}], t)).toEqual([]);
  expect(
    dnsRulePositions(
      'response',
      [unwritten],
      [
        {...main, content},
        {...main, id: 'other', content}
      ],
      t
    )
  ).toEqual([]);
  expect(
    dnsRulePositions(
      'request',
      dns.request,
      sources.map(source => ({...source, writable: false})),
      t
    )
  ).toEqual([]);
});

it('offers the DNS actions of each list and picks the upstream that answered only when one upstream matches it', async () => {
  const api = createMockApi();
  const [dns, {sources}] = await Promise.all([api.dnsRules(), api.config()]);
  const upstreams = dnsUpstreamChoices(dns.request, sources);
  expect(upstreams).toEqual([
    {name: 'cloudflare', address: 'tls://1.1.1.1:853'},
    {name: 'alidns', address: 'udp://223.5.5.5:53'}
  ]);
  expect(dnsActions('request', ['alidns'], t).map(action => action.id)).toEqual(['alidns', 'asis', 'reject']);
  expect(dnsActions('response', ['alidns'], t).map(action => [action.id, action.desc])).toEqual([
    ['accept', 'Keep the answer'],
    ['reject', 'Replace the answer with an empty one'],
    ['alidns', 'Query again through this upstream']
  ]);
  // The log names an upstream by its address without the port the configuration writes.
  const answered = (await api.dnsLog()).records.find(record => record.upstream?.startsWith('udp://223.5.5.5'))!;
  expect(answered.upstream).toBe('udp://223.5.5.5');
  expect(answeredUpstream(upstreams, answered.upstream)).toBe('alidns');
  expect(answeredUpstream(upstreams, 'AliDNS')).toBe('alidns');
  expect(answeredUpstream(upstreams, 'tcp://223.5.5.5')).toBeNull();
  expect(answeredUpstream(upstreams, 'udp://192.0.2.53')).toBeNull();
  // A host two upstreams share, on different ports, names neither.
  expect(answeredUpstream([...upstreams, {name: 'backup', address: 'udp://223.5.5.5:5353'}], 'udp://223.5.5.5')).toBeNull();
  expect(answeredUpstream(upstreams, null)).toBeNull();
});

it('names a DNS duplicate by its action, comparing upstreams without case, and only within its list', () => {
  const listed = [{kind: 'rule' as const, index: 3, expression: 'qname(full: a.example) -> AliDNS', target: 'AliDNS'}];
  expect(duplicateOf('request', listed, [], 'qname(full: a.example)', 'alidns', t)).toBe('Rule 4 already has the same condition and action.');
  const held: PendingRule[] = [{list: 'response', id: 1, condition: 'ip(1.2.3.4/32)', outbound: 'reject', must: false, before: null, sourceId: 'src-main'}];
  expect(duplicateOf('response', [], held, 'ip(1.2.3.4/32)', 'reject', t)).toBe('A held rule already has the same condition and action.');
  expect(duplicateOf('request', [], held, 'ip(1.2.3.4/32)', 'reject', t)).toBeNull();
});

it('says a settled rule write is in effect, keeps the count and notes that open connections keep their route', () => {
  const zh: Translator = (key, params) => translate('zh-TW', key, params);
  expect(ruleWritten('rule.added', t)).toEqual({text: 'New rule is in effect', detail: 'Existing connections keep their current route until they reconnect.'});
  expect(ruleWritten('rule.edited', t).text).toBe('Rule change is in effect');
  expect(ruleWritten('rule.removed', t).text).toBe('Rule removed; the change is in effect');
  expect(ruleWritten('rule.applied', t, 1).text).toBe('1 rule is in effect');
  expect(ruleWritten('rule.applied', t, 3).text).toBe('3 rules are in effect');
  const localized = ruleWritten('rule.applied', zh, 2);
  expect(localized.text).toMatch(/^2 /);
  expect(localized.detail).toBe(translate('zh-TW', 'rule.keepsRoute'));
  expect(localized.detail).not.toBe(ruleWritten('rule.applied', t, 2).detail);
  for (const lang of ['zh-TW', 'zh-CN', 'en'] as const)
    for (const key of ['rule.added', 'rule.edited', 'rule.removed', 'rule.applied'] as const)
      expect(translate(lang, key, {n: 2})).not.toMatch(/重載|重载|reload/i);
});

it('says what happens now without presetting it, and when a routing rule changes nothing', () => {
  const seed: QuickRuleSeed = {domain: 'example.com', dip: null, sip: null, outbound: 'proxy', matched: null};
  const none = quickRuleContext({list: 'routing', seed, upstreams: [], outbound: '', position: undefined});
  expect(none).toEqual({current: 'proxy', unchanged: false, beforeMatched: false});
  expect(quickRuleContext({list: 'routing', seed, upstreams: [], outbound: 'proxy', position: undefined}).unchanged).toBe(true);
  expect(quickRuleContext({list: 'routing', seed, upstreams: [], outbound: 'direct', position: undefined}).unchanged).toBe(false);
  expect(quickRuleContext({list: 'routing', seed: {...seed, outbound: null}, upstreams: [], outbound: 'direct', position: undefined})).toEqual({
    current: null,
    unchanged: false,
    beforeMatched: false
  });
});

it('notes the matched position only when the default is the verified writable match', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const hit = rules.find(rule => rule.kind === 'rule' && ruleWritable(rule, sources))!;
  const seed: QuickRuleSeed = {domain: 'example.com', dip: null, sip: null, outbound: 'proxy', matched: {id: hit.rule_id, expression: hit.expression}};
  const matched = rulePositions(rules, sources, seed.matched, t);
  expect(matched[0].matched).toBe(true);
  expect(quickRuleContext({list: 'routing', seed, upstreams: [], outbound: '', position: matched[0]}).beforeMatched).toBe(true);
  // A match whose rule no longer reads the same is not vouched for, so the default is the fallback and nothing is said.
  const stale = rulePositions(rules, sources, {id: hit.rule_id, expression: 'domain(elsewhere.test)'}, t);
  expect(stale[0].matched).toBe(false);
  expect(quickRuleContext({list: 'routing', seed, upstreams: [], outbound: '', position: stale[0]}).beforeMatched).toBe(false);
});

it('shows the answering upstream of a DNS request as context only', () => {
  const upstreams = [{name: 'alidns', address: 'udp://223.5.5.5:53'}];
  const dns = {type: 'A', answers: [], upstream: 'udp://223.5.5.5:53', query: null};
  const seed: QuickRuleSeed = {domain: 'example.com', dip: null, sip: null, outbound: null, matched: null, dns};
  const request = (value: QuickRuleSeed, outbound = 'alidns') =>
    quickRuleContext({list: 'request', seed: value, upstreams, outbound, position: {matched: false}});
  expect(request(seed)).toEqual({current: 'alidns', unchanged: false, beforeMatched: false});
  // A cache hit names no upstream, so there is no current line.
  expect(request({...seed, dns: {...dns, upstream: null}}).current).toBeNull();
  expect(quickRuleContext({list: 'response', seed, upstreams, outbound: 'accept', position: undefined}).current).toBeNull();
});

it('offers a routing rule direct and block, then each group once, as a final outbound offers them', () => {
  expect(ruleOutbounds([{name: 'proxy'}, {name: 'gaming'}, {name: 'proxy'}, {name: 'direct'}], t)).toEqual([
    {
      id: 'builtin',
      title: 'Built-in',
      items: [
        {id: 'direct', label: 'direct'},
        {id: 'block', label: 'block'}
      ]
    },
    {
      id: 'groups',
      title: 'Groups',
      items: [
        {id: 'proxy', label: 'proxy'},
        {id: 'gaming', label: 'gaming'}
      ]
    }
  ]);
  expect(ruleOutbounds([], t).map(section => section.id)).toEqual(['builtin']);
});
