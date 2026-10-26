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
  inInclude: () => false,
  edit: () => null
};
const read = () => hookHarness.render(() => useNodeTable(input));
beforeEach(() => {
  hookHarness.reset();
  vi.clearAllMocks();
  probe.busy = null;
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
  expect(read().testReason).toBe('None of the listed nodes can be tested.');
  read().testAll();
  expect(probe.probeMany).not.toHaveBeenCalled();
});
