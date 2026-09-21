import {expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {groupConfigFields, memberViews, menuViews, policyCardView, probeSummary} from './view';
import {memberHealth} from './health';
const t: Translator = (key, params) => translate('en', key, params);
it('projects nested, failed and unmeasured members without inventing latency', () => {
  const {groups} = nodeFixtures(0);
  const members = memberViews(memberHealth(groups[0], new Map()));
  expect(members.find(member => member.id === 'jp-01')).toMatchObject({unavailable: true, tcp: undefined});
  expect(members.find(member => member.id === 'resilient')).toMatchObject({nested: true, healthy: false, description: ' '});
  const menu = menuViews([{name: 'unknown'}, {name: 'down', alive: false, tcp: 5}, {name: 'fast', tcp: 0}], t);
  expect(menu.items.map(item => item.description)).toEqual(['—', t('ui.unavailable'), '0 ms']);
  expect(menu.sections[0].items.map(item => item.id)).toEqual(['fast', 'down', 'unknown']);
});
it('keeps split network selection unset for both and omits mutable interrupt configuration from readonly fields', () => {
  const g = nodeFixtures(0).groups[0];
  const members = memberViews(memberHealth(g, new Map()));
  expect(policyCardView(g, members, 'both', t).selected).toBeUndefined();
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
