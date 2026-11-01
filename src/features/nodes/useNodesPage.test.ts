import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {replaceRoute} from '../../shell/route';
import type {ConfigSource, Node, Provider} from '../../api/model';
import {toast} from '../../ui/ui';
import {deferred, hookHarness} from '../../store/testHelpers';
import {formatList, translate} from '../../i18n';
import {subscriptionActionKind} from './view';
import {runSubscriptionAction, useNodesPage} from './useNodesPage';

const {capabilities, version} = await vi.hoisted(() => import('../../../mock/fixtures'));
const store = vi.hoisted(() => ({
  addNode: null as unknown as (input: unknown) => Promise<Node | null>,
  removeNode: vi.fn<(id: string) => Promise<unknown>>(),
  nodes: [] as Node[],
  providers: [] as Provider[],
  sources: [] as ConfigSource[],
  fresh: [] as ConfigSource[],
  apply: vi.fn(),
  refetchNodes: vi.fn(),
  refetchProviders: vi.fn(),
  refetchConfig: vi.fn(),
  deselect: vi.fn()
}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  // The route mock below loads React before this file's static imports are initialized.
  ...(await import('../../store/testHelpers')).hookHarness.hooks,
  useCallback: (callback: unknown) => callback,
  useLayoutEffect: () => undefined
}));
vi.mock('../../store', async () => ({
  useCapabilities: () => ({data: capabilities}),
  useNodeManage: (reload: () => void) => ({
    addNode: (input: unknown) => store.addNode(input),
    removeNode: (id: string) =>
      store.removeNode(id).then(result => {
        reload();
        return result;
      }),
    busy: false
  }),
  useNodes: () => ({data: store.nodes, refetch: store.refetchNodes, loading: false, error: null}),
  useSteadyNodes: (data: unknown) => data,
  useProviders: () => ({data: {providers: store.providers}, refetch: store.refetchProviders, loading: false, error: null}),
  useOutboundNames: () => [],
  useProviderRefresh: () => ({refresh: vi.fn()}),
  useVersion: () => ({data: version}),
  readConfigFresh: () => Promise.resolve({sources: store.fresh})
}));
vi.mock('../../api/index', async original => ({...(await original<typeof import('../../api/index')>()), getApi: () => ({})}));
vi.mock('../../store/config', () => ({
  useCompleteness: () => () => true,
  useConfig: () => ({data: {sources: store.sources}, refetch: store.refetchConfig, loading: false})
}));
vi.mock('../../store/mainSource', async original => ({
  ...(await original<typeof import('../../store/mainSource')>()),
  useMainSourceEdit: () => ({writable: false, busy: false, apply: store.apply})
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
beforeEach(() => {
  hookHarness.reset();
  store.nodes = [];
  store.providers = [];
  store.sources = [];
  store.fresh = [];
  store.apply.mockReset();
  store.removeNode.mockReset();
});
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
  expect(read()).toMatchObject({formValid: false, formReason: expect.stringContaining('node link'), nodeLinkError: null});
  read().setForm({...read().form, name: 'first', value: 'garbage://x'});
  expect(read().nodeLinkError).toBeTruthy();
  expect(read().formValid).toBe(false);
  read().setDialog({kind: 'provider'});
  read().setForm({...read().form, name: '', value: ''});
  expect(read()).toMatchObject({formValid: false, formReason: 'Enter a name'});
});

const fillManual = (fields: Record<string, string>) => Object.entries(fields).forEach(([key, value]) => read().setDraftField(key, value));
const trojan = {protocol: 'trojan', name: 'manual', host: 'example.com', port: '443', password: 'pw'};

it('adds a node from the manual fields under its typed name, each tab keeping its own input', async () => {
  store.addNode = vi.fn().mockResolvedValue({id: 'n1', name: 'manual'});
  read().addNode!();
  read().setNodeLink('vless://one#pasted');
  read().setAddMode('manual');
  expect(read()).toMatchObject({formValid: false, formReason: 'Fill in the required fields.'});
  fillManual(trojan);
  expect(read()).toMatchObject({formValid: true, newName: 'manual', nodeValue: 'trojan://pw@example.com:443?security=tls&type=tcp#manual'});
  read().setAddMode('link');
  expect(read()).toMatchObject({newName: 'pasted', formValid: true});
  expect(read().form.value).toBe('vless://one#pasted');
  read().setAddMode('manual');
  const close = vi.fn();
  await read().submit(close);
  expect(store.addNode).toHaveBeenCalledExactlyOnceWith({name: 'manual', link: 'trojan://pw@example.com:443?security=tls&type=tcp#manual'});
  expect(close).toHaveBeenCalledOnce();
  expect(toast).toHaveBeenCalledWith('positive', 'manual added');
});

it('refuses a manual name that is empty, taken or cannot be written, and starts both tabs empty when reopened', () => {
  store.nodes = [{id: 'n1', name: 'taken'} as Node];
  read().addNode!();
  read().setAddMode('manual');
  fillManual({...trojan, name: ''});
  expect(read()).toMatchObject({formValid: false, formReason: 'Enter a name'});
  for (const [name, error] of [
    ['taken', 'A node already uses this name.'],
    ['two\nlines', expect.any(String)]
  ] as const) {
    read().setDraftField('name', name);
    expect(read()).toMatchObject({formValid: false, nodeNameError: error});
  }
  read().setDialog(null);
  read().addNode!();
  expect(read()).toMatchObject({addMode: 'link', draft: {protocol: 'vless', name: '', host: ''}, nodeValue: ''});
});

it('builds the manual link from the fields shown, and keeps the name and address when the protocol changes', () => {
  read().addNode!();
  read().setAddMode('manual');
  fillManual({...trojan, type: 'ws', path: '/ws'});
  expect(read().nodeValue).toBe('trojan://pw@example.com:443?security=tls&type=ws&path=%2Fws#manual');
  read().setDraftField('type', 'tcp');
  expect(read().nodeValue).toBe('trojan://pw@example.com:443?security=tls&type=tcp#manual');
  read().setDraftField('protocol', 'tuic');
  expect(read()).toMatchObject({draft: {protocol: 'tuic', name: 'manual', host: 'example.com', password: ''}, nodeValue: ''});
  fillManual({username: 'b831381d-6324-4d53-ad4f-8cda48b30811', password: 'pw'});
  expect(read().nodeValue).toBe('tuic://b831381d-6324-4d53-ad4f-8cda48b30811:pw@example.com:443#manual');
  read().setDraftField('username', 'not-a-uuid');
  expect(read().nodeValue).toBe('');
});

it('puts a duplicate-name refusal on the link field and clears it after the derived name changes', async () => {
  const {ApiError} = await import('../../api/error');
  store.addNode = async () => {
    throw new ApiError(409, 'state_conflict', 'An inline node named first already exists');
  };
  read().addNode!();
  read().setNodeLink('vless://one#first');
  expect(read().newName).toBe('first');
  await read().submit(vi.fn());
  expect(read()).toMatchObject({nodeNameError: 'A node already uses this name.', problem: null, formValid: false});
  read().setNodeLink('vless://one#second');
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

it('deletes selected nodes sequentially, names failures and retries only the failed remainder with one reload per batch', async () => {
  store.nodes = ['first', 'second', 'third'].map(name => ({id: name, name, provider_id: 'inline', group_ids: []}) as unknown as Node);
  store.providers = [{id: 'inline', kind: 'inline', name: 'inline'}] as Provider[];
  const first = deferred<unknown>();
  store.removeNode.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('backend refused')).mockResolvedValue(true);
  read().setDialog({kind: 'removeNodes', items: store.nodes, onRemoved: store.deselect});
  expect(read().dialogTitle).toBe('Remove selected (3)');
  const close = vi.fn();
  const sent = read().submit(close);
  expect(store.removeNode).toHaveBeenCalledExactlyOnceWith('first');
  expect(read().submitLabel).toBe('Remove selected (1/3)');
  await read().submit(close);
  expect(store.removeNode).toHaveBeenCalledOnce();
  expect(store.refetchNodes).not.toHaveBeenCalled();
  first.resolve(true);
  await sent;
  expect(store.removeNode.mock.calls).toEqual([['first'], ['second'], ['third']]);
  expect(store.deselect.mock.calls).toEqual([['first'], ['third']]);
  expect(read().batchErrors).toEqual(['second: backend refused']);
  expect(read().removeNodes.map(node => node.id)).toEqual(['second']);
  expect(read().submitLabel).toBe('Remove selected (1)');
  expect(close).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledExactlyOnceWith('warning', translate('en', 'nodes.removed', {name: formatList('en', ['first', 'third'])}));
  expect(store.refetchNodes).toHaveBeenCalledOnce();
  expect(store.refetchProviders).toHaveBeenCalledOnce();
  expect(store.refetchConfig).toHaveBeenCalledOnce();
  await read().submit(close);
  expect(store.removeNode.mock.calls).toEqual([['first'], ['second'], ['third'], ['second']]);
  expect(store.deselect.mock.calls).toEqual([['first'], ['third'], ['second']]);
  expect(close).toHaveBeenCalledOnce();
  expect(store.refetchNodes).toHaveBeenCalledTimes(2);
  expect(store.refetchProviders).toHaveBeenCalledTimes(2);
  expect(store.refetchConfig).toHaveBeenCalledTimes(2);
});
it('stops starting node deletes after closing the dialog and reloads once when the pending request settles', async () => {
  store.nodes = ['first', 'second'].map(name => ({id: name, name, provider_id: 'inline', group_ids: []}) as unknown as Node);
  store.providers = [{id: 'inline', kind: 'inline', name: 'inline'}] as Provider[];
  const first = deferred<unknown>();
  store.removeNode.mockReturnValueOnce(first.promise);
  read().setDialog({kind: 'removeNodes', items: store.nodes, onRemoved: store.deselect});
  const close = vi.fn();
  const sent = read().submit(close);
  read().setDialog(null);
  read().addNode!();
  first.resolve(true);
  await sent;
  expect(store.removeNode).toHaveBeenCalledExactlyOnceWith('first');
  expect(store.deselect).toHaveBeenCalledExactlyOnceWith('first');
  expect(store.refetchNodes).toHaveBeenCalledOnce();
  expect(store.refetchProviders).toHaveBeenCalledOnce();
  expect(store.refetchConfig).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(read().dialog?.kind).toBe('node');
  expect(read().batchErrors).toEqual([]);
  expect(read().pending).toBe(false);
});

it('refuses a protected-only selection and filters protected nodes from a mixed removal dialog', async () => {
  const manual = {id: 'manual', name: 'manual', provider_id: 'inline', group_ids: []} as unknown as Node;
  const protectedNode = {...manual, id: 'subscription', name: 'subscription', provider_id: 'subscription'};
  const included = {...manual, id: 'included', name: 'included'};
  store.sources = [{id: 'include', kind: 'include', content: "node { included: 'vless://demo@example.com:443#included' }"}] as ConfigSource[];
  store.nodes = [manual, protectedNode, included];
  store.providers = [
    {id: 'inline', kind: 'inline', name: 'inline'},
    {id: 'subscription', kind: 'subscription', name: 'subscription'}
  ] as Provider[];
  store.removeNode.mockResolvedValue(true);
  read().setDialog({kind: 'removeNodes', items: [protectedNode, included], onRemoved: store.deselect});
  expect(read().removeNodes).toEqual([]);
  expect(read().formValid).toBe(false);
  await read().submit(vi.fn());
  expect(store.removeNode).not.toHaveBeenCalled();
  read().setDialog({kind: 'removeNodes', items: store.nodes, onRemoved: store.deselect});
  expect(read().removeNodes).toEqual([manual]);
  expect(read().dialogTitle).toBe('Remove selected (1)');
  expect(read().formValid).toBe(true);
  const close = vi.fn();
  await read().submit(close);
  expect(store.removeNode).toHaveBeenCalledExactlyOnceWith(manual.id);
  expect(store.deselect).toHaveBeenCalledExactlyOnceWith(manual.id);
  expect(close).toHaveBeenCalledOnce();
});

// Adding a node rewrites the configuration, so the groups are joined against the source read after the add.
it('joins the added node to the picked groups in the source as it is after the add', async () => {
  const at = (digest: string, filter: string) =>
    ({
      id: 'main',
      kind: 'main',
      writable: true,
      content_sha256: digest,
      content: `group {\n    mine {\n        filter: ${filter}\n        policy: min\n    }\n}\n`
    }) as ConfigSource;
  store.sources = [at('before', 'name(a)')];
  store.addNode = async () => {
    store.fresh = [at('after', 'name(a)')];
    return {id: 'n1', name: 'first'} as Node;
  };
  store.apply.mockResolvedValue({kind: 'ok'});
  read().addNode!();
  read().setNodeLink('vless://one#first');
  read().setJoinPicked(['mine']);
  expect(read().joinChoices).toEqual([{id: 'mine', label: 'mine'}]);
  await read().submit(vi.fn());
  expect(store.apply).toHaveBeenCalledTimes(1);
  const [transform, origin] = store.apply.mock.calls[0];
  expect(origin).toBe(store.fresh[0]);
  expect(transform(origin.content)).toContain('name(a, first)');
  expect(vi.mocked(toast)).toHaveBeenCalledWith('positive', 'first added to mine');
});

it('keeps the node and says so when joining the groups fails', async () => {
  store.sources = [
    {id: 'main', kind: 'main', writable: true, content_sha256: 'x', content: 'group {\n    mine {\n        filter: name(a)\n    }\n}\n'} as ConfigSource
  ];
  store.addNode = async () => {
    store.fresh = store.sources;
    return {id: 'n1', name: 'first'} as Node;
  };
  store.apply.mockResolvedValue({kind: 'cancelled'});
  const close = vi.fn();
  read().addNode!();
  read().setNodeLink('vless://one#first');
  read().setJoinPicked(['mine']);
  await read().submit(close);
  expect(close).toHaveBeenCalledTimes(1);
  expect(vi.mocked(toast)).toHaveBeenCalledWith('negative', expect.stringContaining('joining the selected groups failed'), expect.anything());
});

it('names the refused lines in the toast when joining the groups is refused', async () => {
  store.sources = [
    {
      id: 'main',
      kind: 'main',
      path: '/etc/dae/config.dae',
      writable: true,
      content_sha256: 'x',
      content: 'group {\n    mine {\n        filter: name(a)\n    }\n}\n'
    } as ConfigSource
  ];
  store.addNode = async () => {
    store.fresh = store.sources;
    return {id: 'n1', name: 'first'} as Node;
  };
  store.apply.mockResolvedValue({
    kind: 'invalid',
    diagnostics: [{level: 'error', source_id: 'main', line: 3, column: 9, span: null, code: 'unsupported_value', message: 'filter: bad term'}]
  });
  read().addNode!();
  read().setNodeLink('vless://one#first');
  read().setJoinPicked(['mine']);
  await read().submit(vi.fn());
  expect(vi.mocked(toast)).toHaveBeenCalledWith('negative', expect.stringContaining('joining the selected groups failed'), {
    detail: 'config.dae line 3: Unsupported value: filter: bad term'
  });
});
