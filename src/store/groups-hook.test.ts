import {afterEach, expect, it, vi} from 'vitest';
import type {Api} from '../api/api';
import type {Capabilities, Node} from '../api/model';
import {createMockApi} from '../../mock';
import {normalizeResourceKey} from '../api/inflight';
import {stubVisibleDocument} from './testHelpers';
import {refetchResource, snapshot, watchResource, type Resource} from './resourceCore';

const state = vi.hoisted(() => ({api: undefined as Api | undefined, nodes: [] as Node[], capabilities: undefined as Capabilities | undefined}));
const watchers = new Map<string, {dispose: () => void}>();
vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useMemo: <T>(read: () => T) => read(),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read()
}));
vi.mock('../api/index', () => ({getApi: () => state.api}));
vi.mock('./nodes', () => ({useNodes: () => ({data: state.nodes})}));
vi.mock('./runtime', () => ({useCapabilities: () => ({data: state.capabilities})}));
vi.mock('./resource', () => ({
  useResource: <T>(resource: Resource<T>, {enabled = true} = {}) => {
    const name = normalizeResourceKey(resource.key);
    if (enabled && !watchers.has(name))
      watchers.set(
        name,
        watchResource(state.api!, {...resource, every: 0}, () => {})
      );
    return {...(enabled ? snapshot<T>(state.api!, name) : {data: undefined}), refetch: () => refetchResource(state.api!, name)};
  }
}));
import {useGroupControl} from './groups';

afterEach(() => {
  for (const watcher of watchers.values()) watcher.dispose();
  watchers.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([false, true])('reenables nested group probes after late inventory (revision changed: %s)', async revisionChanged => {
  vi.useFakeTimers();
  stubVisibleDocument();
  const api = (state.api = createMockApi());
  state.capabilities = await api.capabilities();
  state.nodes = (await api.nodes({limit: 1000})).nodes;
  const child = await api.group('gaming');
  let parent = {...(await api.group('proxy')), members: [{id: child.id, name: child.name, kind: 'group' as const}]};
  let descendant = child;
  api.group = vi.fn(async id => (id === parent.id ? parent : descendant));
  const useRender = () =>
    useGroupControl(
      parent.id,
      () => {},
      () => {}
    );
  useRender();
  await vi.waitFor(() => expect(useRender().data).toBeDefined());
  await vi.waitFor(() => expect(useRender().canProbe).toBe(true));

  const introduced = {...state.nodes.find(node => node.protocol === 'hysteria2')!, id: 'subscription-new-node'};
  descendant = {...child, members: [{id: introduced.id, name: introduced.name, kind: 'node'}]};
  if (revisionChanged) parent = {...parent, config_revision: `${parent.config_revision}-refreshed`};
  for (const name of watchers.keys()) await refetchResource(api, name);
  useRender();
  await vi.waitFor(() => expect(useRender().canProbe).toBe(false));
  state.nodes = [...state.nodes, introduced];
  expect(useRender().canProbe).toBe(true);
  expect(useRender().probeChoices.map(choice => choice.id)).toContain('http');
});
