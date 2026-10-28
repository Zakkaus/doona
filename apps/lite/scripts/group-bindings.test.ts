import {expect, it} from 'vitest';
import {nodeBinding, subscriptionFilter, honkPolicy} from '../src/groupBindings';
import {compileFilters} from '../../../src/dae/groupFilters';
import type {Node, Provider} from '../../../src/api/model';
import {demoFixtures} from '../src/demo/createMockApi';

it('seeds three usable demo subscriptions without script-specific node names', () => {
  const {nodes, groups} = demoFixtures.inventory.nodeFixtures(120);
  const subscriptions = demoFixtures.inventory.providers.filter(provider => provider.kind === 'subscription');
  expect(subscriptions).toHaveLength(3);
  for (const provider of subscriptions) expect(nodes.filter(node => node.provider_id === provider.id)).toHaveLength(40);
  expect(nodes.some(node => /台灣|美國|韓國|英國|德國|澳洲|家寬|解鎖|流媒體/.test(node.name))).toBe(false);
  const names = new Map(nodes.map(node => [node.id, node.name]));
  for (const group of groups)
    for (const member of group.members) {
      if (member.kind === 'node') expect(member.name).toBe(names.get(member.id));
    }
});
it('keeps same-name nodes separate and qualifies the source in the stored filter', () => {
  const providers = [
    {id: 'p1', name: 'one', kind: 'subscription'},
    {id: 'p2', name: 'two', kind: 'subscription'}
  ] as Provider[];
  const nodes = [
    {id: 'n1', name: 'same', provider_id: 'p1', subscription_tag: 'one'},
    {id: 'n2', name: 'same', provider_id: 'p2', subscription_tag: 'two'}
  ] as Node[];
  const bindings = nodes.map(node => nodeBinding(node, providers, 'Node'));
  expect(new Set(bindings.map(item => item.id)).size).toBe(2);
  expect(nodes.filter(compileFilters([bindings[0].filter]))).toEqual([nodes[0]]);
});
it('qualifies subscribed nodes even when provider metadata is unavailable', () => {
  const node = {id: 'subscribed', name: 'same', provider_id: 'feed', subscription_tag: 'feed'} as Node;
  const binding = nodeBinding(node, [], 'Manual');
  const matches = compileFilters([binding.filter]);
  expect(binding.description).toBe('feed');
  expect(matches(node)).toBe(true);
  expect(matches({...node, subscription_tag: null})).toBe(false);
});
it('validates Rust regex and preserves its text in the binding', () => {
  expect(subscriptionFilter('provider', '(?i)HK|香港')).toBe("subtag('provider') && name(regex: '(?i)HK|香港')");
  expect(subscriptionFilter('provider', '(?=x)')).toBeNull();
});
it.each([
  ['fixed(0)', 'select'],
  ['min_avg10', 'urltest'],
  ['min_moving_avg', 'urltest'],
  ['random', 'select'],
  ['balance', 'roundrobin'],
  ['score', 'score'],
  ['fallback', 'fallback']
])('normalizes %s to honk meaning %s', (input, expected) => expect(honkPolicy(input)).toBe(expected));

it('a manual node binding does not admit subscription nodes with the same name', () => {
  const node = {id: 'manual', name: 'same', subscription_tag: null} as Node;
  const match = compileFilters([nodeBinding(node, [], 'Node').filter]);
  expect(match(node)).toBe(true);
  expect(match({...node, subscription_tag: 'provider'})).toBe(false);
});

import {browserLocale} from '../src/ui/shortcuts';
it.each([
  ['zh-TW', 'zh-TW'],
  ['zh-HK', 'zh-TW'],
  ['zh-Hant', 'zh-TW'],
  ['zh-Hant-HK', 'zh-TW'],
  ['zh-CN', 'zh-CN'],
  ['zh-SG', 'zh-CN'],
  ['zh', 'zh-CN'],
  ['en-AU', 'en'],
  ['fr-FR', 'en']
])('chooses browser language %s as %s', (input, expected) => expect(browserLocale([input])).toBe(expected));
