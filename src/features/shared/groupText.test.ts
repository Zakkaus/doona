import {expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {draftMembers, healthStatus, memberSections} from './groupText';

const t: Translator = (key, params) => translate('en', key, params);
it.each([
  ['healthy', {state: 'healthy', latency_ms: 84}, {text: '84 ms', tone: 'ok'}],
  ['unavailable', {state: 'unavailable', latency_ms: null}, {text: 'Unavailable', tone: 'err'}],
  ['unknown', {state: 'unknown', latency_ms: null}, {text: '—'}],
  ['undefined', undefined, {text: '—'}]
] as const)('shows the health status for %s', (_, health, expected) => {
  expect(healthStatus(health, t)).toEqual(expected);
});

it('offers draft members from name, subscription and nested group filters', () => {
  const {nodes} = nodeFixtures(0, true);
  const hk = nodes.find(node => node.name === 'hk-01')!;
  const sg = nodes.find(node => node.name === 'sg-01')!;
  const input = [
    {...hk, subscription_tag: 'asia'},
    {...sg, subscription_tag: 'other'}
  ];
  expect(draftMembers(["subtag(asia) && name(keyword: 'hk')", 'group(relay)'], input, t).map(member => member.name)).toEqual(['relay', 'hk-01']);
  const members = draftMembers(["subtag(asia) && name(keyword: 'hk')", 'group(relay)'], input, t);
  expect(memberSections(members, [], t)[1].items.map(member => member.nodeName)).toEqual([false, true]);
  expect(draftMembers(['name(sg-01)'], input, t).map(member => member.name)).toEqual(['sg-01']);
  expect(draftMembers(['group(relay)'], input, t)).toEqual([{name: 'relay', nodeName: false, status: {text: t('ui.group'), badge: true}}]);
});
