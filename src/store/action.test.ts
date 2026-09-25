import {expect, it, vi} from 'vitest';
import type {Api} from '../api/api';
import type {OperationAccepted, OperationState} from '../api/model';
import {ApiError} from '../api/error';
import {finished, settle} from './action';
import {refetchAll} from './resourceCore';

vi.mock('./resourceCore', () => ({refetchAll: vi.fn(async () => [])}));

const failed = (details: Record<string, unknown> | null): OperationState =>
  ({
    operation_id: 'op-1',
    kind: 'reload',
    status: 'failed',
    created_at: '2026-09-25T00:00:00Z',
    started_at: '2026-09-25T00:00:00Z',
    finished_at: '2026-09-25T00:00:01Z',
    result: null,
    error: {code: 'reload_rejected', message: 'Reload rejected', details}
  }) as unknown as OperationState;

const failure = (operation: OperationState, written?: boolean) => {
  try {
    finished(operation, 'reload', written === undefined ? undefined : {written});
  } catch (error) {
    return error;
  }
  throw new Error('finished() accepted a failed operation');
};

it.each([
  ['a write the contract does not roll back', null, true, 'ui.writtenNotApplied'],
  ['the backend reporting the file written', {written: true, committed: false}, undefined, 'ui.writtenNotApplied'],
  ['the backend reporting nothing written', {written: false, committed: false}, true, 'ui.operationFailed'],
  ['a committed but degraded activation', {written: true, committed: true}, true, 'ui.operationFailed'],
  ['an operation that writes nothing', null, undefined, 'ui.operationFailed']
])('a failed activation after %s', (_, details, written, key) => {
  expect(failure(failed(details), written)).toMatchObject({key, detail: 'Reload rejected', code: 'reload_rejected'});
});

it('reports an operation the backend no longer knows as an unknown result and re-reads the page', async () => {
  const accepted = {operation_id: 'op-1', kind: 'reload', status: 'queued', href: '/api/v1/operations/op-1', retryAfter: 1} as OperationAccepted;
  const pollOperation = vi.fn().mockRejectedValueOnce(new ApiError(404, 'resource_not_found', 'Operation not found'));
  const api = {pollOperation} as unknown as Api;
  const signal = new AbortController().signal;
  await expect(settle(api, accepted, signal)).rejects.toMatchObject({name: 'LocalError', key: 'ui.operationUnknown'});
  expect(pollOperation).toHaveBeenCalledWith(accepted, signal);
  expect(refetchAll).toHaveBeenCalledOnce();
  const other = new ApiError(503, 'temporarily_unavailable', 'busy');
  pollOperation.mockRejectedValueOnce(other);
  await expect(settle(api, accepted, signal)).rejects.toBe(other);
  expect(refetchAll).toHaveBeenCalledOnce();
});

it('reads a degraded provider publication as applied and a rejected one as failed', () => {
  const refresh = (code: string, details: Record<string, unknown> | null) =>
    ({...failed(null), kind: 'provider_refresh', error: {code, message: 'Provider publication', details}}) as unknown as OperationState;
  expect(finished(refresh('publication_degraded', {committed: true}), 'provider_refresh')).toEqual({degraded: true});
  expect(() => finished(refresh('publication_rejected', null), 'provider_refresh')).toThrow(expect.objectContaining({key: 'ui.operationFailed'}));
});
