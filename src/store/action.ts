import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {Operation, OperationAccepted, OperationState} from '../api/model';
import {ApiError, LocalError} from '../api/error';
import {refetchAll} from './resourceCore';
import {waitOutRefusal} from '../api/refusal';

type ActionState = {busy: string | null; error: Error | null};
function createAction() {
  let state: ActionState = {busy: null, error: null};
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: ActionState) => {
    state = next;
    listeners.forEach(notify => notify());
  };
  return {
    snapshot: () => state,
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => void listeners.delete(notify);
    },
    cancel() {
      active?.abort();
      active = null;
      publish({busy: null, error: null});
    },
    setError(error: Error | null) {
      publish({...state, error});
    },
    async run<T>(kind: string, action: (signal: AbortSignal) => Promise<T>, rethrow: boolean): Promise<T | undefined> {
      if (active) return undefined;
      const controller = new AbortController();
      active = controller;
      publish({busy: kind, error: null});
      try {
        const result = await action(controller.signal);
        return controller.signal.aborted ? undefined : result;
      } catch (reason) {
        if (controller.signal.aborted) return undefined;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        state = {busy: kind, error};
        if (rethrow) throw error;
        return undefined;
      } finally {
        if (active === controller) {
          active = null;
          publish({...state, busy: null});
        }
      }
    }
  };
}
type ActionCell = ReturnType<typeof createAction>;
const actions = new WeakMap<Api, Map<string, ActionCell>>();
export function actionCell(api: Api, shared?: string): ActionCell {
  if (!shared) return createAction();
  let cells = actions.get(api);
  if (!cells) actions.set(api, (cells = new Map()));
  let cell = cells.get(shared);
  if (!cell) cells.set(shared, (cell = createAction()));
  return cell;
}
// Shared transactions outlive a panel closing; local actions still abort on unmount.
export function useAction<K extends string>({scope, rethrow = false, shared}: {scope?: unknown; rethrow?: boolean; shared?: string} = {}) {
  const api = getApi();
  // A local action gets a fresh cell when its scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cell = useMemo(() => actionCell(api, shared), [api, shared, scope]);
  const state = useSyncExternalStore(cell.subscribe, cell.snapshot);
  useEffect(() => (shared ? undefined : cell.cancel), [shared, cell]);
  const run = useCallback(<T>(kind: K, action: (signal: AbortSignal) => Promise<T>) => cell.run(kind, action, rethrow), [cell, rethrow]);
  return {...state, busy: state.busy as K | null, setError: cell.setError, run, cancel: cell.cancel};
}
// Once the backend has accepted an operation, a poll that fails leaves its outcome unknown rather than failed: the
// backend forgets an operation when it restarts or the record expires, and a connection may stay down. Everything
// shown is re-read instead. A cancelled poll stays cancelled, and a failed operation is returned for `finished`.
export async function settle(api: Api, accepted: OperationAccepted, signal?: AbortSignal): Promise<OperationState> {
  try {
    return await api.pollOperation(accepted, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    void refetchAll();
    throw during(new LocalError('ui.operationUnknown'), accepted.operation_id, accepted.kind, accepted.status);
  }
}
// Names the operation a failure belongs to, for the diagnostics a person can copy.
const during = (error: LocalError, id: string, kind: string, status: string) => {
  error.operation = {id, kind, status};
  return error;
};
// A direct write refused with 503 temporarily_unavailable may still have changed what it wrote, so the resource is
// read back. The action stays busy until that read lands and the Retry-After the backend asked for has passed, so the
// control cannot send again sooner.
export const readBackUnconfirmed =
  (refetch: () => unknown, signal?: AbortSignal) =>
  async (error: unknown): Promise<never> => {
    if (error instanceof ApiError && error.status === 503 && error.code === 'temporarily_unavailable')
      await Promise.all([Promise.resolve(refetch()).catch(() => undefined), error.retryAfter && waitOutRefusal(503, error.retryAfter, signal)]);
    throw error;
  };
// If-Match carries the revision as a quoted entity tag.
export const etag = (revision: string) => '"' + revision + '"';
export type SucceededResult<K extends Operation['kind']> = Extract<Operation, {kind: K; status: 'succeeded'}>['result'];
// A provider publication that honk commits to a degraded runtime fails with `committed: true`: the nodes are applied.
type Degraded = {degraded: true};
type Finished<K extends Operation['kind']> = K extends 'provider_refresh' ? SucceededResult<K> | Degraded : SucceededResult<K>;
// `written`: the operation activates a file already written, which a failed activation does not roll back. The
// backend's own `written` and `committed` details, when it sends them, override that default.
export function finished<K extends Operation['kind']>(operation: OperationState, kind: K, {written = false} = {}): Finished<K> {
  if (operation.status === 'succeeded' && operation.kind === kind) return operation.result as Finished<K>;
  const details = (operation.error?.details ?? null) as {written?: unknown; committed?: unknown} | null;
  if (operation.status === 'failed' && kind === 'provider_refresh' && operation.kind === kind && details?.committed === true)
    return {degraded: true} as Finished<K>;
  if (operation.status === 'failed') {
    const outcome = activationError(operation.error, {written});
    if (outcome) throw during(outcome, operation.operation_id, operation.kind, operation.status);
  }
  const onDisk = operation.status === 'failed' && (typeof details?.written === 'boolean' ? details.written : written);
  const failure = new LocalError(
    onDisk ? 'ui.writtenNotApplied' : 'ui.operationFailed',
    operation.error?.message ?? null,
    operation.error?.code ?? null,
    details
  );
  throw during(failure, operation.operation_id, operation.kind, operation.status);
}
// An activation that failed after the new generation became active (`committed: true`) or without knowing whether it
// did (`committed: null`). The outcome code is a failed operation's `error.code` or a synchronous error's
// `details.stage`. The request still failed, so this is the error to throw; everything shown is re-read, as the
// change is or may be active. Any other failure returns null and keeps its own error.
export function activationError(failure: unknown, {written = false} = {}): LocalError | null {
  const {code, message, details} = (failure ?? {}) as {code?: string; message?: string; details?: unknown};
  const outcome = (details ?? null) as {written?: unknown; committed?: unknown; durability_confirmed?: unknown; stage?: unknown} | null;
  if (!outcome || (outcome.committed !== true && outcome.committed !== null)) return null;
  void refetchAll();
  const stage = failure instanceof ApiError ? outcome.stage : code;
  const stored = typeof outcome.written === 'boolean' ? outcome.written : written;
  const key =
    outcome.committed === null
      ? 'ui.activationUnknown'
      : stage === 'store_unavailable'
        ? 'ui.activationNotSaved'
        : outcome.durability_confirmed === false
          ? 'ui.activationDegradedUnconfirmed'
          : stored
            ? 'ui.activationDegradedSaved'
            : 'ui.activationDegraded';
  return new LocalError(key, message ?? null, code ?? null, details);
}
