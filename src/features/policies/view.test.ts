import {expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {ApiError, LocalError} from '../../api/error';
import {actionErrorText, groupConfigFields, memberViews, menuViews, nodeGridView, policyCardView, probeSummary} from './view';
import {memberHealth} from './health';
const t: Translator = (key, params) => translate('en', key, params);
it('projects nested, failed and unmeasured members without inventing latency', () => {
  const {groups} = nodeFixtures(0);
  const members = memberViews(memberHealth(groups[0], new Map()), t);
  expect(members.find(member => member.id === 'jp-01')).toMatchObject({unavailable: true, tcp: undefined, status: {text: t('ui.unavailable'), tone: 'err'}});
  expect(members.find(member => member.id === 'resilient')).toMatchObject({
    nested: true, healthy: false,
    description: ' ',
    status: {text: '—', group: t('ui.group')}
  });
  expect(members.find(member => member.id === 'hk-01')?.status).toEqual({text: '84 ms', tone: 'ok'});
  const menu = menuViews([{name: 'unknown'}, {name: 'down', alive: false, tcp: 5}, {name: 'fast', tcp: 0}], t);
  expect(menu.items.map(item => item.description)).toEqual(['—', t('ui.unavailable'), '0 ms']);
  expect(menu.sections[0].items.map(item => item.id)).toEqual(['fast', 'down', 'unknown']);
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
  expect(actionErrorText(new ApiError(503, 'unavailable', 'offline'), t)).toBe('offline');
});
