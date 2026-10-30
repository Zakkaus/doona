import {beforeEach, expect, it, vi} from 'vitest';
import {useNodeTable} from './useNodeTable';
import {deferred, hookHarness, steadyBase} from '../../store/testHelpers';
import {toast} from '../../ui/ui';

const probe = vi.hoisted(() => ({
  busy: null as string | null,
  probeMany: vi.fn(),
  cancel: vi.fn(),
  probe: vi.fn(),
  choices: (node: {protocol: string | null}) => (node.protocol === 'trojan' ? [] : ['http'])
}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  ...(await import('../../store/testHelpers')).hookHarness.hooks,
  useCallback: (callback: unknown) => callback
}));
vi.mock('react-aria-components', async original => ({
  ...(await original<typeof import('react-aria-components')>()),
  useFilter: () => ({contains: (value: string, query: string) => value.includes(query)})
}));
vi.mock('../../store', () => ({useNodeProbe: () => probe}));
vi.mock('../../ui/ui', async original => ({...(await original<typeof import('../../ui/ui')>()), toast: vi.fn(), useLinked: () => undefined}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});
const nodes = steadyBase
  .slice(0, 4)
  .map((node, index) => ({...node, name: `batch-${index}`, protocol: index === 3 ? 'trojan' : 'vless', group_ids: index === 2 ? ['other'] : ['chosen']}));
const input: Parameters<typeof useNodeTable>[0] = {
  nodes,
  all: nodes,
  sourceOf: () => 'inline',
  providers: [],
  names: new Map(),
  loading: false,
  label: 'Nodes',
  scope: null,
  scopeKey: 'inline',
  multiple: false,
  query: null,
  groupQuery: null,
  nodeIds: [],
  clearNodes: vi.fn(),
  source: {writable: false, busy: false, main: null} as Parameters<typeof useNodeTable>[0]['source'],
  joinable: [],
  canManage: false,
  busy: false,
  reload: vi.fn(),
  joinGroup: vi.fn(),
  onAdd: vi.fn(),
  onNewGroup: vi.fn(),
  onRemove: vi.fn(),
  onRemoveSelected: vi.fn(),
  inInclude: () => false,
  edit: () => null
};
let overrides: Partial<Parameters<typeof useNodeTable>[0]> = {};
const read = () => hookHarness.render(() => useNodeTable({...input, ...overrides}));
beforeEach(() => {
  hookHarness.reset();
  vi.clearAllMocks();
  probe.busy = null;
  overrides = {};
});
it('probes the filtered snapshot, reports progress once and preserves later user sorting', async () => {
  const result = deferred<{tested: number; unavailable: number} | undefined>();
  probe.probeMany.mockReturnValue(result.promise);
  read().setSearch('batch-');
  read().setGroup('chosen');
  read().setProtocol('vless');
  read().testAll();
  const [members, progress] = probe.probeMany.mock.calls[0];
  expect(members.map((node: {id: string}) => node.id)).toEqual(nodes.slice(0, 2).map(node => node.id));
  probe.busy = '*';
  progress(1);
  expect(read()).toMatchObject({testLabel: 'Testing 1/2', testReason: 'Wait for the current test to finish.'});
  read().testAll();
  expect(probe.probeMany).toHaveBeenCalledTimes(1);
  expect(toast).not.toHaveBeenCalled();
  read().setSearch('batch-3');
  result.resolve({tested: 2, unavailable: 1});
  await result.promise;
  expect(read().sort).toEqual({column: 'latency', direction: 'ascending'});
  expect(toast).toHaveBeenCalledExactlyOnceWith('warning', 'Tested 2, unavailable 1');
  read().setSort({column: 'name', direction: 'descending'});
  expect(read().sort).toEqual({column: 'name', direction: 'descending'});
});
it('does not sort or toast a cancelled run', async () => {
  const result = deferred<undefined>();
  probe.probeMany.mockReturnValue(result.promise);
  read().testAll();
  read().cancelTest();
  result.resolve(undefined);
  await result.promise;
  expect(probe.cancel).toHaveBeenCalledOnce();
  expect(read().sort).toEqual({column: 'name', direction: 'ascending'});
  expect(toast).not.toHaveBeenCalled();
});
it('tests only the listed nodes a probe can reach', () => {
  probe.probeMany.mockReturnValue(deferred<undefined>().promise);
  read().testAll();
  const [members, progress] = probe.probeMany.mock.calls[0];
  expect(members.map((node: {id: string}) => node.id)).toEqual(nodes.slice(0, 3).map(node => node.id));
  progress(1);
  expect(read().testLabel).toBe('Test all');
  probe.busy = '*';
  expect(read().testLabel).toBe('Testing 1/3');
});
it('disables the batch when no listed node can be probed', () => {
  read().setProtocol('trojan');
  expect(read().rows.map(row => row.canProbe)).toEqual([false]);
  expect(read().testReason).toBe('No nodes to test.');
  read().testAll();
  expect(probe.probeMany).not.toHaveBeenCalled();
});
it('selects every row but removes only selected manual nodes, preserving per-row delete and clearing after success', () => {
  overrides = {
    canManage: true,
    providers: [{id: 'inline', kind: 'inline'}] as typeof input.providers,
    nodes: nodes.map((node, index) => ({...node, provider_id: index === 3 ? 'subscription' : 'inline'})),
    inInclude: node => node.id === nodes[2].id
  };
  read().selection.onChange(new Set(nodes.map(node => node.id)));
  expect(read().selection.keys).toEqual(new Set(nodes.map(node => node.id)));
  expect(read().deleteSelectedLabel).toBe('Remove selected (2)');
  read().rows[0].remove();
  expect(input.onRemove).toHaveBeenCalledExactlyOnceWith(overrides.nodes![0]);
  read().removeSelected();
  const [selected, onRemoved] = vi.mocked(input.onRemoveSelected).mock.calls[0];
  expect(selected).toEqual(overrides.nodes!.slice(0, 2));
  onRemoved(nodes[0].id);
  expect(read().selection.keys).toEqual(new Set(nodes.slice(1).map(node => node.id)));
  read().removeSelected();
  expect(vi.mocked(input.onRemoveSelected).mock.calls[1][0]).toEqual([overrides.nodes![1]]);
  read().clearSelection();
  expect(read().selection.keys.size).toBe(0);
});
it('allows selection and testing without node management but never batch deletion', () => {
  probe.probeMany.mockReturnValue(deferred<undefined>().promise);
  expect(read().selection.keys.size).toBe(0);
  read().selection.onChange(new Set([nodes[1].id]));
  expect(read().selection.keys).toEqual(new Set([nodes[1].id]));
  expect(read().testLabel).toBe('Test selected (1)');
  read().testAll();
  expect(probe.probeMany.mock.calls[0][0]).toEqual([nodes[1]]);
  expect(read().deleteSelectedLabel).toBeNull();
  read().removeSelected();
  expect(input.onRemoveSelected).not.toHaveBeenCalled();
  expect(read().rows.every(row => !row.removable)).toBe(true);
});
it('tests only selected reachable nodes, including protected rows, and keeps busy labels unchanged', () => {
  overrides = {
    canManage: true,
    providers: [{id: 'inline', kind: 'inline'}] as typeof input.providers,
    nodes: nodes.map((node, index) => ({...node, provider_id: index === 1 ? 'subscription' : 'inline'})),
    inInclude: node => node.id === nodes[2].id
  };
  probe.probeMany.mockReturnValue(deferred<undefined>().promise);
  read().selection.onChange(new Set(nodes.slice(1).map(node => node.id)));
  expect(read().testLabel).toBe('Test selected (3)');
  expect(read().deleteSelectedLabel).toBe('Remove selected (1)');
  read().testAll();
  const [members, progress] = probe.probeMany.mock.calls[0];
  expect(members).toEqual(overrides.nodes!.slice(1, 3));
  probe.busy = '*';
  progress(1);
  expect(read().testLabel).toBe('Testing 1/2');
  read().testAll();
  expect(probe.probeMany).toHaveBeenCalledOnce();
});
it('offers no removal for a selection containing only subscription and include nodes', () => {
  overrides = {
    canManage: true,
    providers: [{id: 'inline', kind: 'inline'}] as typeof input.providers,
    nodes: nodes.map((node, index) => ({...node, provider_id: index === 1 ? 'subscription' : 'inline'})),
    inInclude: node => node.id === nodes[2].id
  };
  read().selection.onChange(new Set([nodes[1].id, nodes[2].id]));
  expect(read().selection.keys).toEqual(new Set([nodes[1].id, nodes[2].id]));
  expect(read().deleteSelectedLabel).toBeNull();
  read().removeSelected();
  expect(input.onRemoveSelected).not.toHaveBeenCalled();
});
it('does not fall back to all nodes when the selected nodes cannot be probed', () => {
  read().selection.onChange(new Set([nodes[3].id]));
  expect(read().testLabel).toBe('Test selected (1)');
  expect(read().testReason).toBe('No nodes to test.');
  read().testAll();
  expect(probe.probeMany).not.toHaveBeenCalled();
});
it('prunes missing selections, preserves protected and read-only selections, and clears on scope or filter changes', () => {
  overrides = {canManage: true, providers: [{id: 'inline', kind: 'inline'}] as typeof input.providers};
  read().selection.onChange(new Set(nodes.slice(0, 3).map(node => node.id)));
  overrides = {...overrides, nodes: nodes.slice(1), inInclude: node => node.id === nodes[2].id};
  expect(read().selection.keys).toEqual(new Set([nodes[1].id, nodes[2].id]));
  overrides = {...overrides, nodes, inInclude: () => false, canManage: false};
  expect(read().selection.keys).toEqual(new Set([nodes[1].id, nodes[2].id]));
  expect(read().deleteSelectedLabel).toBeNull();
  overrides = {...overrides, canManage: true};
  expect(read().selection.keys).toEqual(new Set([nodes[1].id, nodes[2].id]));
  read().setSearch('batch-');
  expect(read().selection.keys.size).toBe(0);
  read().selection.onChange(new Set([nodes[1].id]));
  overrides = {...overrides, scopeKey: 'another'};
  expect(read().selection.keys.size).toBe(0);
});
it.each(['group', 'protocol', 'nodeIds'] as const)('clears selection when the %s filter changes', filter => {
  read().selection.onChange(new Set([nodes[1].id]));
  if (filter === 'group') read().setGroup('chosen');
  else if (filter === 'protocol') read().setProtocol('vless');
  else overrides = {nodeIds: [nodes[1].id]};
  expect(read().selection.keys.size).toBe(0);
});
