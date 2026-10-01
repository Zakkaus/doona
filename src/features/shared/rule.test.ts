import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {ruleLine} from '../../dae/ruleText';
import {answeredUpstream, dnsActions, dnsUpstreamChoices, ruleOutbounds, ruleTargets, ruleWritable, ruleWritten} from './rule';
const t: Translator = (key, params) => translate('en', key, params);

it('offers the exact domain first, then its subdomains and keyword, the destination IP and the source IP as one host', () => {
  const text = (c: {domain?: string | null; dip?: string | null; sip?: string | null}) =>
    ruleTargets({domain: c.domain ?? null, dip: c.dip ?? null, sip: c.sip ?? null}).map(target => ruleLine(target.condition, 'proxy'));
  expect(text({domain: 'api.telegram.org.', dip: '149.154.167.220', sip: '192.168.1.20'})).toEqual([
    'domain(full: api.telegram.org) -> proxy',
    'domain(suffix: api.telegram.org) -> proxy',
    'domain(keyword: api.telegram.org) -> proxy',
    'dip(149.154.167.220/32) -> proxy',
    'sip(192.168.1.20/32) -> proxy'
  ]);
  expect(ruleTargets({domain: 'api.telegram.org', dip: null, sip: null}).map(target => target.kind)).toEqual(['domain', 'domainSuffix', 'domainKeyword']);
  expect(text({dip: '2001:db8::5'})).toEqual(["dip('2001:db8::5/128') -> proxy"]);
  // A domain dae cannot hold is left out; the addresses are still offered.
  expect(text({domain: "it's.example", dip: '1.1.1.1'})).toEqual(['dip(1.1.1.1/32) -> proxy']);
  expect(text({})).toEqual([]);
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
