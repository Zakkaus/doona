import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {nodeFixtures} from '../../api/mock/fixtures';
import type {GroupSummary, Node} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {memberHealth, policyHealth} from './health';
import {memberViews, policyCardView} from './view';

const t: Translator = (key, params) => translate('en', key, params);

it('prefers group TCP data observations by warmth, measurement and IP version before falling back to node health', async () => {
  const group = await createMockApi().group('proxy');
  const base = group.runtime.health[0];
  group.members = ['ranked', 'fallback', 'untested', 'nested'].map(id => ({...group.members[0], id, name: id, kind: id === 'nested' ? 'group' : 'node'}));
  const warm = {...base, member_id: 'ranked', transport: 'tcp' as const, purpose: 'data' as const, warmth: 'warm' as const};
  const best = {...warm, measurement: 'tcp_connect' as const, ip_version: 'ipv4' as const, state: 'unavailable' as const, latency_ms: null};
  const nested = {...best, member_id: 'nested'};
  const fallback = {...best, state: 'healthy' as const, latency_ms: 10};
  group.runtime.health = [
    {...best, warmth: 'cold'},
    {...warm, measurement: 'http_headers'},
    {...best, ip_version: 'ipv6'},
    best,
    {...best, state: 'healthy', latency_ms: 1},
    {...best, member_id: 'fallback', transport: 'udp'},
    {...best, member_id: 'untested', purpose: 'dns'},
    nested
  ];
  const original = structuredClone(group);
  expect(
    memberHealth(
      group,
      new Map([
        ['ranked', {health: fallback}],
        ['fallback', {health: fallback}]
      ])
    )
  ).toEqual([{...group.members[0], health: best}, {...group.members[1], health: fallback}, {...group.members[2]}, {...group.members[3], health: nested}]);
  expect(group).toEqual(original);
  expect(memberHealth(undefined, new Map())).toEqual([]);
});

it('shows the current selected TCP leaf across deep groups without inventing group health', () => {
  const {groups, nodes} = nodeFixtures(0);
  const parent = groups[0];
  const leaf = nodes[4];
  const zero = nodes[0];
  zero.health = zero.health.map(observation => ({...observation, latency_ms: 0}));
  const chain: GroupSummary[] = Array.from({length: 10}, (_, index) => ({
    ...groups[1],
    id: `nested-${index}`,
    name: `Nested ${index}`,
    member_count: 2,
    selection: {tcp_member_id: index === 9 ? leaf.id : `nested-${index + 1}`, udp_member_id: zero.id}
  }));
  parent.members = [{id: chain[0].id, name: chain[0].name, kind: 'group'}];
  parent.runtime.health = [];
  const snapshot = structuredClone({parent, nodes, chain});
  const project = () => memberViews(memberHealth(parent, policyHealth(nodes, chain)), t);
  const member = project()[0];
  expect(member).toMatchObject({tcp: 188, healthy: false, unavailable: false, description: t('policy.selectedNode', {name: leaf.name})});
  expect(policyCardView(parent, [member], 'tcp', t)).toMatchObject({healthy: t('policy.healthy', {n: 0}), untested: t('policy.untested', {n: 1})});
  expect({parent, nodes, chain}).toEqual(snapshot);

  chain[9].selection.tcp_member_id = zero.id;
  expect(project()[0]).toMatchObject({tcp: 0, healthy: false, description: t('policy.selectedNode', {name: zero.name})});
  const observation = {...zero.health.find(health => health.transport === 'tcp')!, member_id: chain[0].id, sorting_latency_ms: null, ranking: null};
  parent.runtime.health = [{...observation, latency_ms: 7}];
  expect(project()[0]).toMatchObject({tcp: 7, healthy: true, description: 'TCP · data'});
  for (const state of ['unavailable', 'unknown'] as const) {
    parent.runtime.health = [{...observation, state, latency_ms: null}];
    expect(project()[0]).toMatchObject({tcp: undefined, healthy: false, unavailable: state === 'unavailable', description: 'TCP · data'});
  }
});

it('keeps absent, cyclic, ambiguous and non-TCP selected paths unmeasured', () => {
  const {groups, nodes} = nodeFixtures(0);
  const parent = groups[0];
  const leaf = nodes[0];
  const nested: GroupSummary = {...groups[1], member_count: 1, selection: {tcp_member_id: leaf.id, udp_member_id: leaf.id}};
  parent.members = [{id: nested.id, name: nested.name, kind: 'group'}];
  parent.runtime.health = [];
  const other: GroupSummary = {...nested, id: 'other', name: 'Other', selection: {tcp_member_id: nested.id, udp_member_id: null}};
  const cases: Array<[string, GroupSummary[], Node[]]> = [
    ['missing group', [], nodes],
    ['UDP selection only', [{...nested, selection: {tcp_member_id: null, udp_member_id: leaf.id}}], nodes],
    ['missing leaf', [{...nested, selection: {tcp_member_id: 'missing', udp_member_id: leaf.id}}], nodes],
    ['cycle', [{...nested, selection: {tcp_member_id: other.id, udp_member_id: leaf.id}}, other], nodes],
    ['ambiguous identity', [nested, {...other, id: leaf.id}], nodes],
    [
      'non-TCP data observations',
      [nested],
      [{...leaf, health: leaf.health.map(health => (health.transport === 'tcp' ? {...health, purpose: 'dns'} : {...health, purpose: 'data'}))}]
    ]
  ];
  for (const [reason, summaries, inventory] of cases) {
    const member = memberViews(memberHealth(parent, policyHealth(inventory, summaries)), t)[0];
    expect(member, reason).toMatchObject({tcp: undefined, healthy: false, unavailable: false, description: ' '});
  }
});
