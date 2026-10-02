import {stubVisibleDocument} from './testHelpers';
import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../../mock';
import {normalizeResourceKey} from '../api/inflight';
import {getApi} from '../api';
import {useEvents} from './events';
import {useResource} from './resource';
import {ResourcePreview} from './preview';
import {retainInactive, snapshot, watchResource} from './resourceCore';

const hooks = vi.hoisted(() => ({
  preview: true,
  samples: null as null | {get: (key: string, data: unknown) => unknown},
  dispose: [] as Array<() => void>
}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  useContext: (context: unknown) => (context === ResourcePreview ? hooks.preview : hooks.samples),
  useRef: (current: unknown) => ({current}),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (subscribe: (notify: () => void) => () => void, read: () => unknown) => {
    hooks.dispose.push(subscribe(() => {}));
    return read();
  }
}));
vi.mock('../api', () => ({getApi: vi.fn()}));
vi.mock('./resourceCore', async original => ({
  ...(await original<typeof import('./resourceCore')>()),
  retainInactive: vi.fn(() => () => {}),
  snapshot: vi.fn(),
  watchResource: vi.fn(() => ({dispose: () => {}, getSnapshot: () => ({data: undefined, error: null, loading: false})}))
}));
afterEach(() => {
  hooks.dispose.splice(0).forEach(dispose => dispose());
  hooks.samples = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('reads cached preview data without starting a resource watcher', () => {
  const api = createMockApi();
  vi.mocked(getApi).mockReturnValue(api);
  const cached = {data: 42, loading: false, error: null};
  vi.mocked(snapshot).mockReturnValue(cached);
  expect(useResource({key: ['runtime'], fetch: vi.fn()}).data).toBe(42);
  expect(retainInactive).toHaveBeenCalledWith(api, normalizeResourceKey(['runtime']));
  expect(watchResource).not.toHaveBeenCalled();
});
it('does not subscribe or replay the event stream for an inert preview', async () => {
  stubVisibleDocument();
  const api = createMockApi();
  api.capabilities = vi.fn(api.capabilities);
  api.subscribeEvents = vi.fn(api.subscribeEvents);
  vi.mocked(getApi).mockReturnValue(api);
  const event = vi.fn();
  useEvents(event, true);
  await Promise.resolve();
  expect(watchResource).not.toHaveBeenCalled();
  expect(api.capabilities).not.toHaveBeenCalled();
  expect(api.subscribeEvents).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
});

it('uses a marked fallback without watching or replacing the cached snapshot', () => {
  const api = createMockApi();
  vi.mocked(getApi).mockReturnValue(api);
  const cached = {data: undefined, loading: false, error: null};
  vi.mocked(snapshot).mockReturnValue(cached);
  hooks.samples = {get: (_, data) => (data === undefined ? 7 : undefined)};
  expect(useResource({key: ['runtime'], fetch: vi.fn()}).data).toBe(7);
  expect(cached.data).toBeUndefined();
  expect(watchResource).not.toHaveBeenCalled();
  vi.mocked(snapshot).mockReturnValue({...cached, data: 42});
  expect(useResource({key: ['runtime'], fetch: vi.fn()}).data).toBe(42);
});
