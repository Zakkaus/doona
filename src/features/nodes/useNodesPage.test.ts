import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {replaceRoute} from '../../shell/route';
import type {ConfigSource, Node} from '../../api/model';
import {toast} from '../../ui/ui';
import {deferred, hookHarness} from '../../store/testHelpers';
import {subscriptionActionKind} from './view';
import {runSubscriptionAction, useNodesPage} from './useNodesPage';

const {capabilities} = await vi.hoisted(() => import('../../../mock/fixtures'));
const store = vi.hoisted(() => ({addNode: null as unknown as (input: unknown) => Promise<Node | null>}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  // The route mock below loads React before this file's static imports are initialized.
  ...(await import('../../store/testHelpers')).hookHarness.hooks,
  useCallback: (callback: unknown) => callback,
  useLayoutEffect: () => undefined
}));
vi.mock('../../store', async () => ({
  useCapabilities: () => ({data: capabilities}),
  useNodeManage: () => ({addNode: (input: unknown) => store.addNode(input), busy: false}),
  useNodes: () => ({data: [], refetch: () => undefined, loading: false, error: null}),
  useProviders: () => ({data: {providers: []}, refetch: () => undefined, loading: false, error: null}),
  useOutboundNames: () => [],
  useProviderRefresh: () => ({refresh: vi.fn()}),
  useVersion: () => ({data: undefined})
}));
vi.mock('../../store/config', () => ({useCompleteness: () => () => true, useConfig: () => ({data: undefined, loading: false})}));
vi.mock('../../store/mainSource', async original => ({
  ...(await original<typeof import('../../store/mainSource')>()),
  useMainSourceEdit: () => ({writable: false, busy: false, apply: vi.fn()})
}));
vi.mock('../../shell/draft', async original => ({
  ...(await original<typeof import('../../shell/draft')>()),
  useDraftGuard: () => ({clear: () => undefined, revision: 0, leave: vi.fn()})
}));
vi.mock('./useSubscriptionEditor', () => ({
  useSubscriptionEditor: () => ({source: null, valid: false, blockedTag: null, fields: null, options: [], errors: {name: null, agent: null}})
}));
vi.mock('../shared/useRefreshAll', () => ({useRefreshAll: () => ({})}));
vi.mock('./useProviderTable', () => ({useProviderTable: () => ({})}));
vi.mock('./useNodeTable', () => ({useNodeTable: () => ({})}));
vi.mock('../../ui/ui', async original => ({...(await original<typeof import('../../ui/ui')>()), toast: vi.fn()}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});

vi.mock('../../shell/route', async importOriginal => ({
  ...(await importOriginal<typeof import('../../shell/route')>()),
  replaceRoute: vi.fn()
}));

it.each(['editSubscription', 'editSubscriptionTag'])('consumes %s before a subscription action without losing list filters', parameter => {
  const events: string[] = [];
  vi.mocked(replaceRoute).mockImplementation((path, query) => events.push(`${path}?${query}`));
  runSubscriptionAction(`${parameter}=harbor&focus=interval&tab=list&q=first&provider=inline`, {run: () => events.push('edit')});
  expect(events).toEqual(['nodes?tab=list&q=first&provider=inline', 'edit']);
});

it.each([true, false])('waits for source validation before consuming a subscription link (%s)', complete => {
  const events: string[] = [];
  vi.mocked(replaceRoute).mockImplementation((path, query) => events.push(`${path}?${query}`));
  const source = {writable: true} as ConfigSource;
  for (const verdict of [undefined, complete]) {
    const kind = subscriptionActionKind(true, true, true, source, verdict);
    runSubscriptionAction('editSubscription=harbor&focus=interval&tab=list', kind && {run: () => events.push(kind)});
    expect(events).toEqual(verdict === undefined ? [] : ['nodes?tab=list', complete ? 'edit' : 'open']);
  }
});

const read = () => hookHarness.render(() => useNodesPage({go: vi.fn(), query: ''}));
beforeEach(() => hookHarness.reset());
afterEach(() => vi.clearAllMocks());

// A request sent from one opening of the dialog settles after the person closed it or opened another: its success
// must not close the new dialog, and its refusal goes to a toast rather than into the new dialog's alert.
it.each([
  ['cancelled', () => read().setDialog(null)],
  ['reopened', () => read().addNode!()],
  ['cancelled and reopened', () => (read().setDialog(null), read().addNode!())]
])('keeps a late result out of a dialog %s while it was pending', async (_case, reopen) => {
  for (const outcome of ['resolve', 'reject'] as const) {
    hookHarness.reset();
    const request = deferred<Node | null>();
    store.addNode = () => request.promise;
    read().addNode!();
    read().setForm({...read().form, name: 'first', value: 'vless://first'});
    const first = read().dialog;
    const close = vi.fn();
    const sent = read().submit(close);
    expect(read().pending).toBe(true);
    reopen();
    const second = read().dialog;
    expect(second).not.toBe(first);
    if (outcome === 'resolve') request.resolve({id: 'n1', name: 'first'} as Node);
    else request.reject(new Error('refused'));
    await sent;
    expect(close).not.toHaveBeenCalled();
    expect(read().dialog).toBe(second);
    expect(read().problem).toBeNull();
    expect(read().pending).toBe(false);
    if (outcome === 'reject')
      expect(vi.mocked(toast)).toHaveBeenCalledWith('negative', expect.any(String), expect.objectContaining({error: expect.any(Error)}));
  }
});

// The same request settling while its own dialog is still open closes it, or shows its refusal inline.
it('lands a result in the dialog that sent it', async () => {
  for (const outcome of ['resolve', 'reject'] as const) {
    hookHarness.reset();
    vi.mocked(toast).mockClear();
    const request = deferred<Node | null>();
    store.addNode = () => request.promise;
    read().addNode!();
    read().setForm({...read().form, name: 'first', value: 'vless://first'});
    const close = vi.fn();
    const sent = read().submit(close);
    if (outcome === 'resolve') request.resolve({id: 'n1', name: 'first'} as Node);
    else request.reject(new Error('refused'));
    await sent;
    expect(close).toHaveBeenCalledTimes(outcome === 'resolve' ? 1 : 0);
    expect(read().problem).toEqual(outcome === 'resolve' ? null : expect.objectContaining({id: 1, kind: 'negative'}));
    expect(vi.mocked(toast).mock.calls.map(call => call[0])).toEqual(outcome === 'resolve' ? ['positive'] : []);
  }
});
