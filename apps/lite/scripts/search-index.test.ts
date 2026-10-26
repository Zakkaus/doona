import {describe, expect, it} from 'vitest';
import {createMockApi} from '../../../mock';
import {resourceIndex, searchNameRank} from '../src/searchIndex';

describe('resource search', () => {
  it('indexes real inventory, routing rules, DNS rules and upstreams', async () => {
    const api = createMockApi({isolated: true});
    const [nodes, groups, providers, config] = await Promise.all([api.nodes(), api.groups(), api.providers(), api.config()]);
    const items = resourceIndex(nodes.nodes, groups, providers.providers, config.sources, 'Manual');
    expect(new Set(items.map(item => item.target.kind))).toEqual(new Set(['node', 'group', 'subscription', 'rule', 'upstream']));
    expect(items.find(item => item.id === 'node:hk-01')?.target).toEqual({kind: 'node', id: 'hk-01'});
    expect(items.some(item => item.category === 'routing' && item.description.includes('NetworkManager'))).toBe(true);
    expect(items.some(item => item.category === 'dns' && item.target.kind === 'rule' && item.target.ruleKind === 'request')).toBe(true);
    expect(items.some(item => item.category === 'dns' && item.target.kind === 'rule' && item.target.ruleKind === 'response')).toBe(true);
    expect(items.some(item => item.label === 'cloudflare' && item.description.includes('1.1.1.1'))).toBe(true);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
  });
  it.each(['Manual', '手动', '手動'])('labels manual sources as %s while preserving subscription names', async manualLabel => {
    const api = createMockApi({isolated: true});
    const [{nodes}, {providers}] = await Promise.all([api.nodes(), api.providers()]);
    const items = resourceIndex(nodes, [], providers, [], manualLabel);
    expect(items.find(item => item.id === 'node:jp-01')?.description).toBe(`vless / ${manualLabel}`);
    const subscribed = nodes.find(node => node.provider_id === 'harbor')!;
    expect(items.find(item => item.id === `node:${subscribed.id}`)?.description).toBe(`${subscribed.protocol} / harbor`);
  });
  it('opens included rules as read-only previews without pointing at a writable main rule', async () => {
    const api = createMockApi({isolated: true});
    const config = await api.config();
    const source = {
      ...config.sources[0],
      id: 'extra',
      path: 'extra.dae',
      kind: 'include' as const,
      content: 'routing {\n # Included rule\n domain(suffix: included.example) -> direct\n}\n'
    };
    const items = resourceIndex([], [], [], [source], 'Manual');
    expect(items).toHaveLength(1);
    expect(items[0].preview).toContain('included.example');
    expect(items[0].description).toContain('extra.dae');
  });
  it('keeps same-name nodes in separate subscriptions distinct', async () => {
    const api = createMockApi({isolated: true});
    const {nodes} = await api.nodes();
    const items = resourceIndex(
      [
        {...nodes[0], id: 'sub-a:node', name: 'Same name'},
        {...nodes[0], id: 'sub-b:node', name: 'Same name'}
      ],
      [],
      [],
      [],
      'Manual'
    );
    expect(items.map(item => item.target.id)).toEqual(['sub-a:node', 'sub-b:node']);
  });
  it('accepts partial search data without inventing results', () => {
    expect(resourceIndex([], [], [], [], 'Manual')).toEqual([]);
  });
});

it('ranks exact names ahead of metadata and partial-name matches', () => {
  const labels = ['香港 01', 'harbor-backup', 'My harbor', 'harbor'];
  expect(labels.sort((a, b) => searchNameRank(a, ' Harbor ') - searchNameRank(b, ' Harbor '))).toEqual(['harbor', 'harbor-backup', 'My harbor', '香港 01']);
  expect(searchNameRank('任意節點', '')).toBe(0);
});
