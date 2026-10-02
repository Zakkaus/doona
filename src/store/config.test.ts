import {expect, it, onTestFinished, vi} from 'vitest';
import * as apiSelection from '../api/index';
import {ApiError, LocalError} from '../api/error';
import {createMockApi} from '../../mock';
import {capabilities} from '../../mock/fixtures';
// The mocked react reads hookHarness, so testHelpers loads before the modules that import react.
import {hookHarness, stubVisibleDocument} from './testHelpers';
import {closestLimit, createSource, readConfigFresh, refusalOutcome, useConfigEditor, useConfigRevisionAction, withinLimits} from './config';
import {watchResource} from './resourceCore';

vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  ...hookHarness.hooks,
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read()
}));
vi.mock('./runtime', () => ({useCapabilities: () => ({data: capabilities})}));

const source = {id: 'main', content_sha256: 'aaa'};
const refused = new ApiError(412, 'precondition_failed', 'Precondition failed');

it.each([null, 1])('requires confirmation again when the fresh head differs before applying revision %s', async revision => {
  hookHarness.reset();
  onTestFinished(() => {
    hookHarness.unmount();
    vi.restoreAllMocks();
  });
  const api = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const list = await api.configRevisions();
  const fresh = vi.spyOn(api, 'configRevisions').mockResolvedValue({...list, active: 12345});
  const importing = vi.spyOn(api, 'importConfig');
  const activating = vi.spyOn(api, 'activateConfigRevision');
  const action = hookHarness.render(useConfigRevisionAction);
  expect(await action.apply(revision, true, list.active)).toEqual({changed: 12345});
  expect(fresh).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(importing).not.toHaveBeenCalled();
  expect(activating).not.toHaveBeenCalled();
});

it('passes the 412 on and forgets nothing when the file changed or the refetch failed', () => {
  expect(refusalOutcome(refused, source, 'bbb', 'main:aaa')).toEqual({error: refused, lastRefused: 'main:aaa'});
  expect(refusalOutcome(refused, source, undefined, null)).toEqual({error: refused, lastRefused: null});
});

it('remembers the first refusal of an unchanged digest and reports the disk ahead on the second', () => {
  const first = refusalOutcome(refused, source, 'aaa', null);
  expect(first).toEqual({error: refused, lastRefused: 'main:aaa'});
  const second = refusalOutcome(refused, source, 'aaa', first.lastRefused);
  expect(second.error).toBeInstanceOf(LocalError);
  expect((second.error as LocalError).key).toBe('config.diskAhead');
  expect(second.lastRefused).toBe('main:aaa');
});

it('counts refusals per source and digest', () => {
  expect(refusalOutcome(refused, source, 'aaa', 'other:aaa')).toEqual({error: refused, lastRefused: 'main:aaa'});
  expect(refusalOutcome(refused, {id: 'main', content_sha256: 'ccc'}, 'ccc', 'main:aaa').error).toBe(refused);
});

it('finds the advertised limit a write uses most of, measuring content in UTF-8 bytes and the body as JSON', () => {
  expect(closestLimit({content: 4, body: 100}, 'ab', {content: 'ab'})).toEqual({limit: 4, exceeded: false});
  expect(closestLimit({content: 4, body: 100}, 'äää', {content: 'äää'})).toEqual({limit: 4, exceeded: true});
  const quotes = '"'.repeat(6);
  expect(closestLimit({content: 100, body: 20}, quotes, {content: quotes})).toEqual({limit: 20, exceeded: true});
  expect(closestLimit({}, 'x'.repeat(1000), {content: 'x'.repeat(1000)})).toBeUndefined();
});

it('refuses a write over a limit before sending it and names that limit', async () => {
  let sent = false;
  const quotes = '"'.repeat(600);
  const refusal = await withinLimits({content: 1000, body: 1100}, quotes, {content: quotes}, async () => (sent = true)).catch((error: unknown) => error);
  expect(sent).toBe(false);
  expect((refusal as ApiError).text).toEqual({key: 'config.tooLarge', params: {limit: 1100}});
});

it('names the limit a 413 most likely hit, which is not always the smaller one, and leaves other failures as sent', async () => {
  const refused = new ApiError(413, 'request_too_large', 'Request body exceeds its limit');
  const reject = (error: ApiError) => () => Promise.reject(error);
  // Escaping makes 500 quotes a 1,014-byte body: closer to its 1,100 limit than the 500 bytes of text to theirs.
  const quotes = '"'.repeat(500);
  const named = await withinLimits({content: 1000, body: 1100}, quotes, {content: quotes}, reject(refused)).catch((error: unknown) => error);
  expect((named as ApiError).text).toEqual({key: 'config.tooLarge', params: {limit: 1100}});
  expect(await withinLimits({}, 'x', {content: 'x'}, reject(refused)).catch((error: unknown) => error)).toBe(refused);
  const other = new ApiError(422, 'unsupported_value', 'Invalid');
  expect(await withinLimits({body: 65536}, 'x', {content: 'x'}, reject(other)).catch((error: unknown) => error)).toBe(other);
});

it('creates an empty source through a reload and returns the id the configuration lists it under', async () => {
  const api = createMockApi();
  const id = await createSource(api, 'config.d/work.dae', new AbortController().signal);
  const created = (await api.config()).sources.find(source => source.id === id);
  expect(created).toMatchObject({kind: 'include', writable: true, content: ''});
  expect(created!.path.endsWith('/config.d/work.dae')).toBe(true);
  await expect(createSource(api, 'config.d/work.dae', new AbortController().signal)).rejects.toMatchObject({status: 409, code: 'state_conflict'});
  await expect(createSource(api, 'elsewhere/work.dae', new AbortController().signal)).rejects.toMatchObject({status: 422, code: 'unsupported_value'});
});

it('creates the source when only the read-back of the configuration fails, without naming an id', async () => {
  const api = createMockApi();
  const config = api.config.bind(api);
  let reads = 0;
  api.config = (...args) => (++reads === 1 ? Promise.reject(new ApiError(503, 'service_unavailable', 'Unavailable')) : config(...args));
  expect(await createSource(api, 'config.d/work.dae', new AbortController().signal)).toBeNull();
  expect((await api.config()).sources.some(source => source.path.endsWith('/config.d/work.dae'))).toBe(true);
});

it('finds a created source again whose name holds a space, CJK or a question mark', async () => {
  const api = createMockApi();
  for (const name of ['my work', String.fromCodePoint(0x5de5, 0x4f5c), 'a?b']) {
    const id = await createSource(api, `config.d/${name}.dae`, new AbortController().signal);
    expect((await api.config()).sources.find(source => source.id === id)?.path).toMatch(new RegExp(`/config\\.d/${name.replace('?', '\\?')}\\.dae$`));
  }
});

it('reads the configuration past the watched copy, one request a call, and leaves that copy as fetched', async () => {
  stubVisibleDocument();
  onTestFinished(() => void vi.unstubAllGlobals());
  const api = createMockApi();
  const watched = watchResource(api, {key: ['config'], every: 0, fetch: signal => api.config(signal)}, () => {});
  onTestFinished(watched.dispose);
  const before = await vi.waitUntil(() => watched.getSnapshot().data);
  const created = (config: {sources: {path: string}[]}) => config.sources.some(source => source.path.endsWith('/config.d/work.dae'));
  expect(created(before)).toBe(false);
  await createSource(api, 'config.d/work.dae', new AbortController().signal);
  const read = vi.spyOn(api, 'config');
  const {signal} = new AbortController();
  const fresh = await readConfigFresh(api, signal);
  await readConfigFresh(api, signal);
  expect(read.mock.calls).toEqual([[signal], [signal]]);
  expect(created(fresh)).toBe(true);
  expect(watched.getSnapshot().data).toBe(before);
});

it.each([
  {path: '<redacted>', writes: 1, validations: 0},
  {path: '/etc/honk/config.dae', writes: 0, validations: 1}
])('conditionally replaces a main source at $path when full validation has no include base', async ({path, writes, validations}) => {
  hookHarness.reset();
  onTestFinished(() => {
    hookHarness.unmount();
    vi.restoreAllMocks();
  });
  const api = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const source = {...main, path};
  const content = main.content! + '\n# updated\n';
  const diagnostic = {
    level: 'error' as const,
    source_id: source.id,
    line: null,
    column: null,
    span: null,
    code: 'include_not_found',
    message: 'No include-resolution base'
  };
  const validate = vi.spyOn(api, 'validateConfig').mockResolvedValue({
    valid: false,
    generation_id: '40',
    validated_at: new Date().toISOString(),
    diagnostics: [diagnostic]
  });
  const replace = vi.spyOn(api, 'replaceConfigSource');
  const refetch = vi.fn();
  const editor = hookHarness.render(() => useConfigEditor(refetch, {rethrow: true}));
  hookHarness.runEffects();
  const result = await editor.apply(source, content);
  expect(validate).toHaveBeenCalledTimes(validations);
  expect(replace).toHaveBeenCalledTimes(writes);
  if (validations) expect(validate).toHaveBeenCalledWith({sources: [{id: source.id, path, content}], mode: 'full'}, expect.any(AbortSignal));
  if (writes) {
    expect(replace).toHaveBeenCalledWith(source.id, content, `"${source.content_sha256}"`, expect.any(AbortSignal));
    expect(result).toHaveProperty('result');
    expect(refetch).toHaveBeenCalledOnce();
    expect((await api.config()).sources.find(item => item.id === source.id)?.content).toBe(content);
  } else {
    expect(result).toEqual({diagnostics: [diagnostic]});
    expect(refetch).not.toHaveBeenCalled();
    expect((await api.config()).sources.find(item => item.id === source.id)?.content).toBe(main.content);
  }
});

// The write settles only once the configuration is read back, and a read that fails leaves the caller its draft.
it.each([
  {name: 'a delayed read-back', outcome: {ok: true as const}, operationFails: false, errorKey: null},
  {name: 'a failed read-back', outcome: {ok: false as const, error: new Error('offline')}, operationFails: false, errorKey: 'ui.writtenNotRead'},
  {
    name: 'a failed apply and read-back',
    outcome: {ok: false as const, error: new Error('offline')},
    operationFails: true,
    errorKey: 'ui.writtenNotApplied'
  },
  {
    name: 'a read-back cut off by its resource leaving',
    outcome: {ok: false as const, error: new DOMException('left', 'AbortError')},
    operationFails: false,
    errorKey: null
  }
])('settles a write only after $name', async ({outcome, operationFails, errorKey}) => {
  hookHarness.reset();
  onTestFinished(() => {
    hookHarness.unmount();
    vi.restoreAllMocks();
  });
  const api = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const main = (await api.config()).sources.find(item => item.kind === 'main')!;
  if (operationFails) {
    const pollOperation = api.pollOperation.bind(api);
    vi.spyOn(api, 'pollOperation').mockImplementation(async (...args) => ({
      ...(await pollOperation(...args)),
      status: 'failed',
      finished_at: '2026-09-25T00:00:01Z',
      result: null,
      error: {code: 'reload_rejected', message: 'Reload rejected', details: null}
    }));
  }
  let release!: () => void;
  const refetch = vi.fn(() => new Promise(resolve => (release = () => resolve({key: 'config', ...outcome}))));
  const editor = hookHarness.render(() => useConfigEditor(refetch, {rethrow: true}));
  hookHarness.runEffects();
  let settled = false;
  const applied = editor.apply(main, main.content! + '\n# updated\n').then(
    value => ((settled = true), value),
    error => ((settled = true), error)
  );
  await vi.waitUntil(() => refetch.mock.calls.length > 0, {timeout: 10000});
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(settled).toBe(false);
  release();
  const result = await applied;
  if (errorKey) expect(result).toMatchObject({name: 'LocalError', key: errorKey});
  else expect(result).toHaveProperty('result');
});
