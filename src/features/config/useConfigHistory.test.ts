import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as apiSelection from '../../api';
import type {Api} from '../../api/api';
import {ApiError} from '../../api/error';
import {diagnostics, formatDiagnostics} from '../../api/diagnostics';
import {createMockApi} from '../../api/mock';
import {capabilities} from '../../api/mock/fixtures';
import type {ConfigRevisionList, EffectiveConfig, OperationState} from '../../api/model';
import {hookHarness} from '../../store/testHelpers';
import {useConfigHistory} from './useConfigHistory';

vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  ...hookHarness.hooks,
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read()
}));
vi.mock('../../store', () => ({useCapabilities: () => ({data: capabilities}), useConfig: () => ({data: config})}));
vi.mock('../../store/config', async original => ({
  ...(await original<typeof import('../../store/config')>()),
  useConfigRevisions: () => list
}));
vi.mock('../../ui/ui', async () => {
  // The hoisted mock factory runs before static imports are initialized.
  const {toast, toastFailure} = await import('../../ui/Feedback');
  return {toast, toastFailure, downloadFile: vi.fn()};
});
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});

let api: Api;
let config: EffectiveConfig;
let list: {data: ConfigRevisionList | undefined; error: Error | null};
const read = () => hookHarness.render(useConfigHistory);
beforeEach(async () => {
  hookHarness.reset();
  diagnostics.clear();
  api = createMockApi();
  await api.pollOperation(await api.importConfig(true));
  config = await api.config();
  list = {data: await api.configRevisions(), error: null};
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
});
afterEach(() => {
  hookHarness.unmount();
  vi.restoreAllMocks();
});

it.each([null, 1])('blocks another POST after an unknown outcome and rereads the accepted operation for revision %s', async revision => {
  const importing = vi.spyOn(api, 'importConfig');
  const activating = vi.spyOn(api, 'activateConfigRevision');
  const unavailable = new ApiError(503, 'service_unavailable', 'Unavailable');
  const poll = vi.spyOn(api, 'pollOperation').mockRejectedValueOnce(unavailable).mockRejectedValueOnce(unavailable);
  read().show(revision);
  expect(read().confirmDisabled).toBe(false);
  await read().submit();
  const operation = read().confirmation?.operation;
  expect(operation).toMatchObject({operation_id: expect.any(String), href: expect.any(String)});
  expect(read().confirmation?.revision).toBe(revision);
  expect(read().confirmDisabled).toBe(true);
  await read().submit();
  expect(importing).toHaveBeenCalledTimes(revision === null ? 1 : 0);
  expect(activating).toHaveBeenCalledTimes(revision === null ? 0 : 1);
  await read().reread();
  expect(read().confirmation?.operation).toBe(operation);
  expect(read().confirmDisabled).toBe(true);
  await read().submit();
  await read().reread();
  expect(poll.mock.calls.map(call => call[0])).toEqual([operation, operation, operation]);
  expect(read().confirmation).toBeNull();
  expect(importing).toHaveBeenCalledTimes(revision === null ? 1 : 0);
  expect(activating).toHaveBeenCalledTimes(revision === null ? 0 : 1);
});

it.each([false, true])('imports without a head check after the revisions list fails (cached=%s)', async cached => {
  if (!cached) list.data = undefined;
  list.error = new ApiError(503, 'service_unavailable', 'Unavailable');
  const fresh = vi.spyOn(api, 'configRevisions').mockRejectedValue(list.error);
  const importing = vi.spyOn(api, 'importConfig');
  read().show(null);
  expect(read().confirmation?.head).toBeUndefined();
  expect(read().confirmDisabled).toBe(false);
  await read().submit();
  expect(fresh).not.toHaveBeenCalled();
  expect(importing).toHaveBeenCalledOnce();
  expect(read().confirmation).toBeNull();
});

it.each([
  {revision: null, navigate: false},
  {revision: 1, navigate: false},
  {revision: null, navigate: true},
  {revision: 1, navigate: true}
])('recovers revision $revision after closing (navigate=$navigate) without another write', async ({revision, navigate}) => {
  const importing = vi.spyOn(api, 'importConfig');
  const activating = vi.spyOn(api, 'activateConfigRevision');
  const poll = vi.spyOn(api, 'pollOperation').mockRejectedValueOnce(new ApiError(503, 'service_unavailable', 'Unavailable'));
  read().show(revision);
  read();
  hookHarness.runEffects();
  await read().submit();
  const operation = read().confirmation?.operation;
  read().close();
  if (navigate) {
    hookHarness.unmount();
    hookHarness.reset();
  }
  read().show(revision === null ? 1 : null);
  expect(read().confirmation).toMatchObject({revision, operation});
  expect(read().confirmDisabled).toBe(true);
  await read().submit();
  expect(importing).toHaveBeenCalledTimes(revision === null ? 1 : 0);
  expect(activating).toHaveBeenCalledTimes(revision === null ? 0 : 1);
  await read().reread();
  expect(poll.mock.calls.map(call => call[0])).toEqual([operation, operation]);
  expect(read().confirmation).toBeNull();
  read().show(null);
  expect(read().confirmDisabled).toBe(false);
});

it.each([null, 1])('keeps a failed revision %s operation copyable with its backend details', async revision => {
  const poll = api.pollOperation.bind(api);
  let operationId = '';
  vi.spyOn(api, 'pollOperation').mockImplementation(async (...args) => {
    const operation = await poll(...args);
    operationId = operation.operation_id;
    return {
      ...operation,
      status: 'failed',
      result: null,
      error: {
        code: 'store_unavailable',
        message: 'Revision store fsync failed on the backend volume',
        details: {
          committed: true,
          diagnostics: [{level: 'error', code: 'invalid_config', message: 'Backend volume is read-only', source_id: null, line: null, column: null, span: null}]
        }
      }
    } as unknown as OperationState;
  });
  read().show(revision);
  await read().submit();
  expect(read().problem).not.toBeNull();
  expect(read().diagnostics.map(row => row.backend)).toContain('Backend volume is read-only');
  expect(read().confirmDisabled).toBe(false);
  const copied = formatDiagnostics(diagnostics.snapshot(), {doona: 'test', route: '/config'});
  expect(copied).toContain('code: store_unavailable');
  expect(copied).toContain('message: Revision store fsync failed on the backend volume');
  expect(copied).toContain(`operation: ${operationId} reload failed`);
  expect(copied).toContain('"committed":true');
});
