import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate} from '../../i18n';
import {searchView, type SearchSources} from './view';

it('keeps destination identity and encoded queries when different hit types have the same label', async () => {
  const api = createMockApi();
  const node = (await api.nodes()).nodes[0];
  const group = (await api.groups())[0];
  const label = 'same & name';
  const sources: SearchSources = {
    capabilities: {data: await api.capabilities()},
    connections: {data: undefined},
    nodes: {data: [{...node, name: label, provider_id: 'provider & one'}]},
    groups: {data: [{...group, name: label}]},
    providers: {data: undefined},
    config: {data: undefined},
    rules: {data: undefined}
  };
  const view = searchView(label, sources, translate.bind(null, 'en'));
  const nodeHit = view.byId.get(`node:${node.id}`)!;
  const groupHit = view.byId.get(`group:${group.id}`)!;
  expect(nodeHit.route).toBe('nodes');
  expect(new URLSearchParams(nodeHit.query).get('q')).toBe(label);
  expect(new URLSearchParams(nodeHit.query).get('provider')).toBe('provider & one');
  expect(groupHit.route).toBe('policies');
  expect(new URLSearchParams(groupHit.query).get('group')).toBe(group.id);
  expect(view.sections.flatMap(section => section.items).map(item => item.id)).toEqual([nodeHit.id, groupHit.id]);
});
