import {expect, it, vi} from 'vitest';
import type {Api} from '../api/api';
import type {OperationAccepted, OperationState} from '../api/model';
import {ApiError} from '../api/error';
import {actionCell, activationError, finished, settle} from './action';
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
  ['an operation that writes nothing', null, undefined, 'ui.operationFailed']
])('a failed activation after %s', (_, details, written, key) => {
  expect(failure(failed(details), written)).toMatchObject({key, detail: 'Reload rejected', code: 'reload_rejected', details});
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

const outcome = (code: string, details: Record<string, unknown>) =>
  ({...failed(null), error: {code, message: 'Activation', details}}) as unknown as OperationState;

it.each([
  ['a degraded reload', 'reload_degraded', {committed: true}, undefined, 'ui.activationDegraded'],
  ['an unreconciled supervisor after a save', 'supervisor_reconciliation_failed', {written: true, committed: true}, undefined, 'ui.activationDegradedSaved'],
  ['a degraded write the operation does not roll back', 'reload_degraded', {committed: true}, true, 'ui.activationDegradedSaved'],
  [
    'a degraded save not confirmed durable',
    'reload_degraded',
    {written: true, committed: true, durability_confirmed: false},
    undefined,
    'ui.activationDegradedUnconfirmed'
  ],
  ['a store that could not record it', 'store_unavailable', {written: false, committed: true, durability_confirmed: false}, true, 'ui.activationNotSaved'],
  ['an activation the server lost', 'activation_unconfirmed', {written: true, committed: null}, true, 'ui.activationUnknown']
])('a failed operation after %s reports the state it left and re-reads the page', (_, code, details, written, key) => {
  vi.mocked(refetchAll).mockClear();
  expect(failure(outcome(code, details), written)).toMatchObject({key, detail: 'Activation', code, details});
  expect(refetchAll).toHaveBeenCalledOnce();
});

it('keeps an activation that never became active as the plain failure', () => {
  vi.mocked(refetchAll).mockClear();
  expect(failure(outcome('reload_rejected', {written: false, committed: false}))).toMatchObject({key: 'ui.operationFailed'});
  expect(activationError(new ApiError(503, 'temporarily_unavailable', 'busy', null, {stage: 'reload_rejected', committed: false}))).toBeNull();
  expect(activationError(new ApiError(503, 'temporarily_unavailable', 'busy'))).toBeNull();
  expect(refetchAll).not.toHaveBeenCalled();
});

it.each([
  ['reload_degraded', {committed: true}, 'ui.activationDegraded'],
  ['reload_degraded', {written: true, committed: true}, 'ui.activationDegradedSaved'],
  ['supervisor_reconciliation_failed', {written: true, committed: true, durability_confirmed: false}, 'ui.activationDegradedUnconfirmed'],
  ['store_unavailable', {written: false, committed: true}, 'ui.activationNotSaved'],
  ['activation_unconfirmed', {committed: null}, 'ui.activationUnknown']
])('a synchronous failure with stage %s and %j', (stage, details, key) => {
  vi.mocked(refetchAll).mockClear();
  const error = new ApiError(503, 'temporarily_unavailable', 'Activation', null, {stage, ...details});
  expect(activationError(error)).toMatchObject({key, detail: 'Activation', code: 'temporarily_unavailable', details: {stage, ...details}});
  expect(refetchAll).toHaveBeenCalledOnce();
});

it('publishes a failed action with its busy state cleared', async () => {
  const cell = actionCell({} as Api, 'failure');
  const states: ReturnType<typeof cell.snapshot>[] = [];
  cell.subscribe(() => states.push(cell.snapshot()));
  const error = new Error('failed');
  await cell.run(
    'save',
    async () => {
      throw error;
    },
    false
  );
  expect(states).toEqual([
    {busy: 'save', error: null},
    {busy: null, error}
  ]);
});
