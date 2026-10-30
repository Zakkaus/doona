import {describe, expect, it} from 'vitest';
import {capabilities} from '../../../mock/fixtures/capabilities';
import {ApiError, LocalError} from '../../../src/api/error';
import type {OperationState} from '../../../src/api/model';
import {LiteError, readMain} from '../src/api';
import {validateContent} from '../src/config';
import {createMockApi} from '../src/demo/createMockApi';
import {finished} from '../src/operations';
import {noticeLevel} from '../src/ui';

describe('write result levels', () => {
  it('treats an unconfirmed write as a warning even when it arrives as an error', () => {
    expect(noticeLevel({error: new LiteError('unknownOutcome')}).level).toBe('warning');
    expect(noticeLevel({error: new LiteError('writtenNotRead')}).level).toBe('warning');
  });

  it('treats a partial refresh as a warning from its key alone', () => {
    expect(noticeLevel({key: 'refreshPartial'})).toEqual({key: 'refreshPartial', level: 'warning'});
    expect(noticeLevel({key: 'degraded'}).level).toBe('warning');
  });

  it('keeps refused writes as errors and finished ones as success', () => {
    expect(noticeLevel({error: new ApiError(412, 'precondition_failed', 'stale')}).level).toBe('error');
    expect(noticeLevel({key: 'changesSaved'}).level).toBe('success');
  });
});

describe('notice docs and detail', () => {
  it.each([
    [{error: new LiteError('readOnly')}, 'req-config-edit', undefined],
    [{error: new LiteError('incomplete')}, 'req-config-edit', undefined],
    [{error: new ApiError(403, 'permission_denied', 'denied')}, 'sign-in', undefined],
    [{error: new LiteError('validationUnavailable')}, 'req-validation', undefined],
    [{error: new LiteError('invalidConfig', '3: bad')}, 'req-validation', '3: bad'],
    [{error: new LiteError('invalidConfig', '3: missing', 'offline-dependency')}, 'offline-dependency', '3: missing'],
    [{error: new LiteError('restartRequired')}, 'reload-and-restart', undefined],
    [{error: new LocalError('ui.operationFailed', 'probe timed out')}, undefined, 'probe timed out'],
    [{key: 'readOnly'}, undefined, undefined]
  ] as const)('%#: links the section that explains the refusal and keeps its detail', (notice, docs, detail) => {
    expect(noticeLevel(notice)).toMatchObject({docs, detail});
  });

  it('keeps the reason of a failed operation as the detail', () => {
    const failed = {id: 'op', kind: 'probe', status: 'failed', error: {code: 'probe_failed', message: 'no route'}} as unknown as OperationState;
    expect(() => finished(failed, 'probe')).toThrow(expect.objectContaining({key: 'ui.operationFailed', detail: 'no route'}));
  });

  it.each([
    ['missing-offline-dependency', 'invalidConfig', 'offline-dependency'],
    ['offline-dependency-denied', 'invalidConfig', 'offline-dependency'],
    ['restart-required', 'restartRequired', undefined],
    ['syntax', 'invalidConfig', undefined]
  ])('names the docs for a rejected change with %s', async (code, key, docs) => {
    const api = await createMockApi({isolated: true});
    const rejecting = new Proxy(api, {
      get: (target, name) =>
        name === 'validateConfig'
          ? async () => ({valid: false, diagnostics: [{level: 'error', code, message: 'rejected', line: 3}]})
          : Reflect.get(target, name)
    });
    const source = await readMain(api);
    await expect(validateContent({api: rejecting, capabilities, address: 'test'}, source, `${source.content}\n`)).rejects.toMatchObject({
      key,
      docs,
      detail: '3: rejected'
    });
  });
});
