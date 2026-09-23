import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {nodeFixtures} from '../api/mock/fixtures';
import {LangContext, translate} from '../i18n';
import {memberHealth, policyHealth} from '../features/policies/health';
import {memberViews} from '../features/policies/view';
import {NodeTile} from './Tile';

it('renders a nested group badge alongside selected-node zero latency and its provenance', () => {
  const {groups, nodes} = nodeFixtures(0);
  const nested = groups[1];
  const selected = nodes.find(node => node.id === nested.runtime.selection.tcp?.member_id)!;
  selected.health = selected.health.map(health => ({...health, latency_ms: 0}));
  const summaries = [{...nested, member_count: nested.members.length, selection: {tcp_member_id: selected.id, udp_member_id: null}}];
  const member = memberViews(memberHealth(groups[0], policyHealth(nodes, summaries)), (key, params) => translate('en', key, params)).find(
    member => member.id === nested.id
  )!;
  const html = renderToStaticMarkup(createElement(LangContext.Provider, {value: 'en'}, createElement(NodeTile, member)));
  expect(html).toContain('>Group<');
  expect(html).toContain('>0 ms<');
  expect(html).toContain(translate('en', 'policy.selectedNode', {name: selected.name}));
});

it('renders nested group failures and unknown latency instead of hiding them behind the badge', () => {
  for (const unavailable of [true, false]) {
    const html = renderToStaticMarkup(createElement(LangContext.Provider, {value: 'en'}, createElement(NodeTile, {name: 'Nested', status: {text: unavailable ? 'Unavailable' : '—', group: 'Group'}, description: ' '})));
    expect(html).toContain('>Group<');
    expect(html).toContain(unavailable ? '>Unavailable<' : '>—<');
  }
});
