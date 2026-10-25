import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {replaceRoute} from '../../shell/route';
import type {ConfigSource, Node} from '../../api/model';
import {toast} from '../../ui/ui';
import {deferred, hookHarness} from '../../store/testHelpers';
import {subscriptionActionKind} from './view';
import {runSubscriptionAction, useNodesPage} from './useNodesPage';

const {capabilities, version} = await vi.hoisted(() => import('../../../mock/fixtures'));
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
  useSteadyNodes: (data: unknown) => data,
  useProviders: () => ({data: {providers: []}, refetch: () => undefined, loading: false, error: null}),
  useOutboundNames: () => [],
  useProviderRefresh: () => ({refresh: vi.fn()}),
  useVersion: () => ({data: version})
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

it('explains empty add forms and shows an edited unsupported link on its field', () => {
  read().addNode!();
  expect(read()).toMatchObject({formValid: false, formReason: 'Enter a name', nodeLinkError: null});
  read().setForm({...read().form, name: 'first', value: 'garbage://x'});
  expect(read().nodeLinkError).toBeTruthy();
  expect(read().formValid).toBe(false);
  read().setDialog({kind: 'provider'});
  read().setForm({...read().form, name: '', value: ''});
  expect(read()).toMatchObject({formValid: false, formReason: 'Enter a name'});
});

it('puts a duplicate-name refusal on Name and clears it after the name changes', async () => {
  const {ApiError} = await import('../../api/error');
  store.addNode = async () => {
    throw new ApiError(409, 'state_conflict', 'An inline node named first already exists');
  };
  read().addNode!();
  read().setForm({...read().form, name: 'first', value: 'vless://first'});
  await read().submit(vi.fn());
  expect(read()).toMatchObject({nodeNameError: 'A node already uses this name.', problem: null, formValid: false});
  read().setForm({...read().form, name: 'second'});
  expect(read()).toMatchObject({nodeNameError: null, formValid: true});
});

it('adds valid lines sequentially, keeps failed lines and retries a single remainder', async () => {
  const first = deferred<Node | null>();
  store.addNode = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('backend refused')).mockResolvedValue({name: 'third'});
  read().addNode!();
  read().setNodeLink('vless://one#first\nvless://two#second\nvless://three#third');
  expect(read().formValid).toBe(true);
  const close = vi.fn();
  const sent = read().submit(close);
  expect(store.addNode).toHaveBeenCalledTimes(1);
  expect(read().submitLabel).toBe('Adding 1/3');
  await read().submit(close);
  expect(store.addNode).toHaveBeenCalledTimes(1);
  first.resolve({name: 'first'} as Node);
  await sent;
  expect(vi.mocked(store.addNode).mock.calls.map(([input]) => input)).toEqual([
    {name: 'first', link: 'vless://one#first'},
    {name: 'second', link: 'vless://two#second'},
    {name: 'third', link: 'vless://three#third'}
  ]);
  expect(read().form).toMatchObject({name: 'second', value: 'vless://two#second'});
  expect(read().batchErrors).toEqual(['second: backend refused']);
  expect(close).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledExactlyOnceWith('warning', 'Added 2, failed 1');
  expect(read().formValid).toBe(true);
  await read().submit(close);
  expect(close).toHaveBeenCalledOnce();
});
it('excludes invalid lines, counts them and blocks batches over 200', async () => {
  store.addNode = vi.fn().mockResolvedValue({name: 'good'});
  read().addNode!();
  read().setNodeLink('wrong://bad\nvless://good');
  await read().submit(vi.fn());
  expect(store.addNode).toHaveBeenCalledExactlyOnceWith({name: 'good', link: 'vless://good'});
  expect(read().form.value).toBe('wrong://bad');
  expect(toast).toHaveBeenCalledExactlyOnceWith('warning', 'Added 1, failed 1');
  read().setNodeLink(Array(201).fill('vless://host').join('\n'));
  expect(read().formValid).toBe(false);
  expect(read().nodeLinkError).toBe('Use at most 200 links.');
});
it('stops a batch after closing its dialog without sending the next line', async () => {
  const request = deferred<Node | null>();
  store.addNode = vi.fn(() => request.promise);
  read().addNode!();
  read().setNodeLink('vless://first\nvless://second');
  const sent = read().submit(vi.fn());
  read().setDialog(null);
  read().addNode!();
  request.resolve({name: 'first'} as Node);
  await sent;
  expect(store.addNode).toHaveBeenCalledTimes(1);
  expect(read().form.value).toBe('');
  expect(read().batchErrors).toEqual([]);
});
