import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {Capabilities, Operation, OperationAccepted, OperationState, ProbeRequest} from '../api/model';
import {ApiError, LocalError} from '../api/error';
import {refetchAll} from './resourceCore';

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
// The backend forgets an operation when it restarts or the record expires, so a 404 while polling leaves the
// outcome unknown: everything shown is re-read rather than reporting the operation missing.
export async function settle(api: Api, accepted: OperationAccepted, signal?: AbortSignal): Promise<OperationState> {
  try {
    return await api.pollOperation(accepted, signal);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    void refetchAll();
    throw new LocalError('ui.operationUnknown');
  }
}
// If-Match carries the revision as a quoted entity tag.
export const etag = (revision: string) => '"' + revision + '"';
export type SucceededResult<K extends Operation['kind']> = Extract<Operation, {kind: K; status: 'succeeded'}>['result'];
// A provider publication that honk commits to a degraded runtime fails with `committed: true`: the nodes are applied.
export type Degraded = {degraded: true};
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
    if (outcome) throw outcome;
  }
  const onDisk = operation.status === 'failed' && (typeof details?.written === 'boolean' ? details.written : written);
  throw new LocalError(onDisk ? 'ui.writtenNotApplied' : 'ui.operationFailed', operation.error?.message ?? null, operation.error?.code ?? null, details);
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
// A warm latency probe through the node over every reachable IP version; a group target probes its direct members, a
// node target must not name members. HTTP dials the configured check URL through the node, as honk's own health check
// does; `tcp_connect` only reaches the node's server endpoint, which a UDP-only protocol such as Hysteria2 or TUIC
// never accepts, so it is the fallback for a backend that offers no HTTP probe.
export function latencyProbe(capabilities: Capabilities | undefined, target: ProbeRequest['target']): ProbeRequest | null {
  const probes = capabilities?.resources.probes;
  const kind = probes?.kinds?.includes('http') ? 'http' : probes?.kinds?.includes('tcp_connect') ? 'tcp_connect' : null;
  if (!probes?.available || !kind || !probes.transports?.includes('tcp') || !probes.targets?.includes(target.type)) return null;
  const ipv4 = probes.ip_versions?.includes('ipv4');
  const ipv6 = probes.ip_versions?.includes('ipv6');
  if (!ipv4 && !ipv6) return null;
  const request: Omit<ProbeRequest, 'members'> & {members?: ProbeRequest['members']} = {
    target,
    kind,
    transport: ['tcp'],
    warmth: 'warm',
    ip_version: ipv4 && ipv6 ? 'any' : ipv6 ? 'ipv6' : 'ipv4'
  };
  if (target.type === 'group') request.members = 'direct';
  // The generated type reads the contract's `default: direct` as "always present"; the contract itself forbids
  // the field on a node target.
  return request as ProbeRequest;
}
