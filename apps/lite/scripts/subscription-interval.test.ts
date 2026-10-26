import {describe, expect, it} from 'vitest';
import {parseInterval, readSubscriptionEntries, writeSubscriptionEntry} from '../../../src/dae/subscriptions';
import {nodeBinding} from '../src/groupBindings';
import {readGroupEntries, writeGroupEntry} from '../../../src/dae/groups';
import {compileFilters} from '../../../src/dae/groupFilters';
import type {Node, Provider} from '../../../src/api/model';

const source = `# Keep comments and line endings
subscription {
  first: 'https://first.example/feed'(custom-agent) # first note
  second: 'https://second.example/feed' {
    interval: '3600s'
    cache: true
  }
  legacy: {
    url: 'https://legacy.example/feed'
    interval: unusual-value
    ua: 'legacy-agent'
  }
}
group {
  target {
    filter: name(other)
    policy: min_moving_avg
    default: direct
  }
}
`;
describe('node feature configuration preservation', () => {
  it.each(['\n', '\r\n'])('preserves untouched subscriptions byte for byte with %j line endings', ending => {
    const original = source.replaceAll('\n', ending);
    for (const entry of readSubscriptionEntries(original)) {
      expect(writeSubscriptionEntry(original, entry.tag, {url: entry.url})).toBe(original);
    }
    const updated = writeSubscriptionEntry(original, 'first', {interval: parseInterval('6h')});
    const entries = readSubscriptionEntries(updated);
    expect(entries.find(entry => entry.tag === 'first')?.interval).toBe(21600);
    for (const old of readSubscriptionEntries(original).filter(entry => entry.tag !== 'first')) {
      const next = entries.find(entry => entry.tag === old.tag)!;
      expect(updated.slice(next.from, next.to)).toBe(original.slice(old.from, old.to));
    }
    expect(updated).toContain('# first note');
    expect(entries.find(entry => entry.tag === 'first')?.ua).toBe('custom-agent');
  });
  it('adds a source-qualified member without changing the policy or other subscriptions', () => {
    const node = {
      id: 'subscription-node',
      name: 'same-name',
      protocol: 'vless',
      provider_id: 'feed',
      subscription_tag: 'second',
      group_ids: [],
      health: []
    } satisfies Node;
    const providers = [{id: 'feed', name: 'second', kind: 'subscription'}] as Provider[];
    const entry = readGroupEntries(source)[0];
    const next = writeGroupEntry(source, entry.name, {policy: entry.policy, filters: [...entry.filters, nodeBinding(node, providers, 'Manual').filter]});
    const changed = readGroupEntries(next)[0];
    expect(changed.policy).toBe(entry.policy);
    expect(changed.default).toBe(entry.default);
    expect(compileFilters(changed.filters)(node)).toBe(true);
    expect(compileFilters(changed.filters)({...node, subscription_tag: null})).toBe(false);
    expect(next.slice(0, next.indexOf('group {'))).toBe(source.slice(0, source.indexOf('group {')));
  });
});
