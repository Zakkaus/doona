import {expect, it} from 'vitest';
import type {OperationState} from '../api/model';
import {finished} from './action';

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
