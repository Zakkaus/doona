import {expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {ApiError, LocalError} from '../../api/error';
import {actionErrorText, checkFields, checkInvalid, checkPatch, groupConfigFields, memberViews, nodeGridView, policyCardView, probeSummary} from './view';
import {memberHealth} from './health';
const t: Translator = (key, params) => translate('en', key, params);
it('projects nested, failed and unmeasured members without inventing latency', () => {
  const {groups} = nodeFixtures(0);
  const members = memberViews(memberHealth(groups[0], new Map()), t);
  expect(members.find(member => member.id === 'jp-01')).toMatchObject({unavailable: true, tcp: undefined, status: {text: t('ui.unavailable'), tone: 'err'}});
  expect(members.find(member => member.id === 'resilient')).toMatchObject({
    healthy: false,
    description: ' ',
    status: {text: t('ui.group'), badge: true}
  });
  expect(members.find(member => member.id === 'hk-01')?.status).toEqual({text: '84 ms', tone: 'ok'});
});
it('keeps split network selection unset for both and omits mutable interrupt configuration from readonly fields', () => {
  const g = nodeFixtures(0).groups[0];
  const members = memberViews(memberHealth(g, new Map()), t);
  expect(policyCardView(g, members, 'both', t).selected).toBeUndefined();
  // Both networks, two members: each is marked with the network it carries.
  expect(policyCardView(g, members, 'both', t).marks).toEqual({'hk-01': 'TCP', 'hk-02': 'UDP'});
  expect(policyCardView(g, members, 'tcp', t).marks).toEqual({});
  expect(policyCardView(g, members, 'tcp', t).selected).toBe('hk-01');
  expect(policyCardView(g, members, 'udp', t).selected).toBe('hk-02');
  expect(policyCardView(g, members, 'both', t).fields.some(([key]) => key === t('policy.cfg.interruptConnections'))).toBe(false);
  expect(groupConfigFields(g)).toContainEqual(['policy.cfg.checkInterval', {key: 'policy.cfg.seconds', params: {n: 30}}]);
  expect(groupConfigFields(g)).toContainEqual(['policy.cfg.interruptConnections', {key: 'ui.no'}]);
});
it('counts worst probe outcome once per member and reports selection changes', () => {
  const sample = {
    ...nodeFixtures(0).groups[0].runtime.health[0],
    resolved_leaf_node_id: null,
    purpose: 'data' as const,
    warmth: 'warm' as const,
    kind: 'tcp_connect' as const,
    health_updated: true
  };
  const result = probeSummary({
    target: {type: 'group', group_id: 'proxy'},
    selection_before: {tcp: null, udp: null},
    selection_after: {tcp: 'a', udp: null},
    results: [
      {...sample, member_id: 'a', state: 'healthy'},
      {...sample, member_id: 'a', state: 'unavailable'},
      {...sample, member_id: 'b', state: 'unknown'}
    ],
    selection_changed: {tcp: true, udp: false}
  });
  expect(result).toEqual({key: 'policy.probeChanged', params: {healthy: 0, unavailable: 1, unknown: 1}});
});

it('names the policy as the picker does and keeps the engine spelling for the tooltip', () => {
  const group = nodeFixtures(0).groups[0];
  const card = (native: string) => policyCardView({...group, policy: {kind: 'urltest', native}}, [], 'both', t).policy;
  expect(card('min_moving_avg')).toEqual({label: t('arrange.policy.fastest'), id: 'min_moving_avg'});
  expect(card('min_avg10')).toEqual({label: t('policy.kind.urltest'), id: 'min_avg10'});
  expect(card('')).toEqual({label: t('policy.kind.urltest'), id: 'urltest'});
});

it('filters large grids by region and observed health without mutating member order', () => {
  const nodes = Array.from({length: 13}, (_, index) => ({
    id: String(index),
    name: `node-${index}`,
    tcp: 20 - index,
    unavailable: index === 0,
    healthy: index > 0,
    status: {text: ''},
    description: '',
    region: index < 3 ? 'HK' : '?'
  }));
  const contains = (value: string, query: string) => value.includes(query);
  const view = nodeGridView(nodes, {q: 'node', region: 'HK', sort: 'latency', aliveOnly: true}, contains, t, 'en-US');
  expect(view.shown.map(node => node.id)).toEqual(['2', '1']);
  expect(nodes[0].id).toBe('0');
  expect(view.regions).toContainEqual({id: 'HK', label: 'HK', desc: '3'});
  expect(view.count).toBe(t('policy.members', {n: 2}));
  const small = nodeGridView(nodes.slice(0, 2), {q: 'missing', region: '?', sort: 'latency', aliveOnly: true}, contains, t, 'en-US');
  expect(small.shown.map(node => node.id)).toEqual(['0', '1']);
});

it('names the default member and describes an observation in words', () => {
  const g = nodeFixtures(0).groups[0];
  const member = g.members[0];
  const fields = groupConfigFields({...g, config: {...g.config, default_member_id: member.id}});
  expect(fields).toContainEqual(['policy.cfg.defaultMember', member.name]);
  const [view] = memberViews([{...member, kind: 'node', health: {...g.runtime.health[0], transport: 'udp', purpose: 'dns'}}], t);
  expect(view.description).toBe(t('policy.observedVia', {transport: 'UDP', purpose: 'DNS'}));
  // The usual observation, over TCP on the data path, goes without saying on every tile.
  const [usual] = memberViews([{...member, kind: 'node', health: {...g.runtime.health[0], transport: 'tcp', purpose: 'data'}}], t);
  expect(usual.description).toBe(' ');
});

it('reports a partial probe with translated counts and the stopping error', () => {
  const cause = new LocalError('ui.operationFailed', 'member refused');
  const error = Object.assign(new LocalError('ui.operationFailed'), {cause, partialResult: {}, completed: 1200, total: 1500});
  const text = actionErrorText(error, t);
  expect(text).toContain(t('policy.probePartial', {done: 1200, n: 1500, error: t('ui.valuePair', {label: t('ui.operationFailed'), value: 'member refused'})}));
  expect(text).toContain('1,200');
  expect(text).not.toContain('ui.operationFailed');
  expect(actionErrorText(new ApiError(503, 'unavailable', 'offline'), t)).toBe(t('ui.backendMessage', {message: 'offline'}));
});

// Pinning depends on each group's can_override, which the page-wide note cannot know; the cards offer it themselves.
it('keeps pinning out of the page-wide note in every language', () => {
  expect(translate('en', 'policy.note')).not.toMatch(/pin/i);
  // The zh word for pinning, taken from the pinned badge.
  for (const lang of ['zh-TW', 'zh-CN'] as const) expect(translate(lang, 'policy.note')).not.toContain(translate(lang, 'policy.overridden').slice(-2));
});

it('counts each probed member once, by the row that says most', () => {
  const row = (member_id: string, ip_version: 'ipv4' | 'ipv6', state: 'healthy' | 'unavailable' | 'unknown') => ({
    member_id,
    ip_version,
    state,
    kind: 'tcp_connect',
    transport: 'tcp',
    purpose: 'data',
    warmth: 'cold',
    latency_ms: state === 'healthy' ? 0.2 : null,
    error: state === 'healthy' ? null : {code: state === 'unknown' ? 'address_unavailable' : 'probe_failed', message: ''},
    health_updated: true,
    observed_at: '2026-09-20T04:12:36.546Z',
    resolved_leaf_node_id: member_id
  });
  const summary = probeSummary({
    target: {type: 'group', group_id: 'g'},
    selection_changed: {tcp: false, udp: false},
    selection_before: {tcp: null, udp: null},
    selection_after: {tcp: null, udp: null},
    // Every member also gets an ipv6 row with no address; it must not hide the ipv4 answer.
    results: [
      row('a', 'ipv4', 'healthy'),
      row('a', 'ipv6', 'unknown'),
      row('b', 'ipv6', 'unknown'),
      row('b', 'ipv4', 'unavailable'),
      row('c', 'ipv4', 'unknown')
    ]
  } as unknown as Parameters<typeof probeSummary>[0]);
  expect(summary).toEqual({key: 'policy.probeUnchanged', params: {healthy: 1, unavailable: 1, unknown: 1}});
});
const withInterval = <G extends ReturnType<typeof nodeFixtures>['groups'][number]>(g: G): G => ({
  ...g,
  capabilities: {...g.capabilities, mutable_config: [...g.capabilities.mutable_config, 'check_interval']}
});
it('offers only the writable check fields, and none on a selector group', () => {
  const [proxy, resilient] = nodeFixtures(0).groups;
  expect(checkFields(proxy)).toEqual([]);
  // honk lists check_url only; a backend that also lists check_interval gets both fields.
  expect(checkFields(resilient)).toEqual(['check_url']);
  expect(checkFields(withInterval(resilient))).toEqual(['check_url', 'check_interval']);
});
it('patches only the check fields that changed, sending null for an empty one', () => {
  const g = withInterval(nodeFixtures(0).groups[1]);
  expect(checkPatch(g, {check_url: '', check_interval: '30'})).toEqual([]);
  expect(checkPatch(g, {check_url: ' https://cp.cloudflare.com/ ', check_interval: '30'})).toEqual([
    {op: 'replace', path: '/config/check_url', value: 'https://cp.cloudflare.com/'}
  ]);
  expect(checkPatch(g, {check_url: '', check_interval: ''})).toEqual([{op: 'replace', path: '/config/check_interval', value: null}]);
  const set = {...g, config: {...g.config, check_url: 'http://a.example/'}};
  expect(checkPatch(set, {check_url: '', check_interval: '60'})).toEqual([
    {op: 'replace', path: '/config/check_url', value: null},
    {op: 'replace', path: '/config/check_interval', value: 60}
  ]);
  // A field the backend does not list is never sent.
  const urlOnly = {...g, capabilities: {...g.capabilities, mutable_config: ['check_url' as const]}};
  expect(checkPatch(urlOnly, {check_url: '', check_interval: '60'})).toEqual([]);
});
it('accepts only a safe http URL and a positive whole interval, or an empty field', () => {
  for (const url of ['', 'http://a.example', 'https://a.example:8443/generate_204?x=1']) expect(checkInvalid('check_url', url)).toBe(false);
  for (const url of [
    'ftp://a.example/',
    'a.example/',
    'http://user@a.example/',
    'http://a.example/a b',
    'http://a.example/a,b',
    'https://',
    'https://a.example/' + 'x'.repeat(2048)
  ])
    expect(checkInvalid('check_url', url)).toBe(true);
  for (const interval of ['', '1', ' 30 ']) expect(checkInvalid('check_interval', interval)).toBe(false);
  for (const interval of ['0', '-1', '1.5', '1e3', 'x']) expect(checkInvalid('check_interval', interval)).toBe(true);
});
