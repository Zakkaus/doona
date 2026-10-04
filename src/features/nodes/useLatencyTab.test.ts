import {beforeEach, expect, it, vi} from 'vitest';
import type {GroupSummary, HealthObservation, Node} from '../../api/model';
import {hookHarness} from '../../store/testHelpers';
import {nodeHref} from '../shared/link';
import {useLatencyTab} from './useLatencyTab';

type Inventory = {nodes: Node[]; groups: GroupSummary[]; providers: {id: string}[]};
const inventory = vi.hoisted(() => ({current: null as unknown as Inventory, shown: true}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  ...(await import('../../store/testHelpers')).hookHarness.hooks
}));
vi.mock('../../store', () => ({
  useCapabilities: () => ({data: undefined}),
  useNodes: () => ({data: inventory.current.nodes, loading: false, error: null, refetch: () => undefined}),
  useGroups: () => ({data: inventory.current.groups}),
  useProviders: () => ({data: {providers: inventory.current.providers}})
}));
vi.mock('../../ui/useTabShown', () => ({useTabShown: () => inventory.shown}));
vi.mock('../../i18n', async original => ({...(await original<typeof import('../../i18n')>()), useLang: () => 'en'}));

// An inventory every part of which carries its tag, so what the hook returns says which one it was built from.
const reading = (latency: number): HealthObservation => ({
  transport: 'tcp',
  purpose: 'data',
  ip_version: 'ipv4',
  warmth: 'warm',
  measurement: 'tcp_connect',
  sample_source: 'probe',
  state: 'healthy',
  latency_ms: latency,
  moving_avg_ms: latency + 1,
  avg10_ms: latency + 2,
  observed_at: '2026-10-05T00:00:00.000Z',
  error: null
});
const inventoryOf = (tag: string, latency: number): Inventory => ({
  nodes: [
    {
      id: `node-${tag}`,
      name: `Node ${tag}`,
      protocol: 'vless',
      subscription_tag: null,
      provider_id: `provider-${tag}`,
      group_ids: [`group-${tag}`],
      health: [reading(latency)]
    }
  ],
  groups: [{id: `group-${tag}`, name: `Group ${tag}`} as GroupSummary],
  providers: [{id: `provider-${tag}`}]
});
const [a, b, c] = [inventoryOf('a', 40), inventoryOf('b', 80), inventoryOf('c', 120)];
const render = (next: Inventory, shown: boolean) => {
  inventory.current = next;
  inventory.shown = shown;
  return hookHarness.render(() => useLatencyTab());
};
const seen = (tab: ReturnType<typeof useLatencyTab>) => ({
  nodes: tab.nodes.data,
  groups: tab.view.map(group => group.label),
  averages: tab.view.flatMap(group => group.rows.map(row => [row.latest, row.moving, row.avg10])),
  hrefs: [...tab.hrefs]
});
const expected = (source: Inventory) => ({
  nodes: source.nodes,
  groups: source.groups.map(group => group.name),
  averages: source.nodes.map(node => [node.health[0].latency_ms, node.health[0].moving_avg_ms, node.health[0].avg10_ms]),
  hrefs: source.nodes.map(node => [node.id, nodeHref(node, source.providers, true)])
});

beforeEach(() => hookHarness.reset());

it('holds the last shown data while the tab is hidden and shows the latest on return', () => {
  expect(seen(render(a, true))).toEqual(expected(a));
  expect(seen(render(a, false))).toEqual(expected(a));
  expect(seen(render(b, false))).toEqual(expected(a));
  expect(seen(render(c, false))).toEqual(expected(a));
  const shown = render(c, true);
  expect(seen(shown)).toEqual(expected(c));
  expect(shown.nodes.data).toBe(c.nodes);
  expect(seen(shown)).not.toEqual(expected(a));
});
