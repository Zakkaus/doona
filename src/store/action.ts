import {useCallback, useEffect, useRef, useState} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {Capabilities, Operation, OperationAccepted, OperationState, ProbeRequest} from '../api/model';
import {ApiError, LocalError} from '../api/error';
import {refetchAll} from './resourceCore';
// One action per hook; an abort drops the late result, a failure lands in `error` and rethrows when asked.
export function useAction<K extends string>({scope, rethrow = false}: {scope?: unknown; rethrow?: boolean} = {}) {
  const api = getApi();
  const [busy, setBusy] = useState<K | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setBusy(null);
    setError(null);
  }, []);
  useEffect(() => cancel, [api, scope, cancel]);
  const run = useCallback(
    async <T>(kind: K, action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      if (active.current) return undefined;
      const controller = new AbortController();
      active.current = controller;
      setBusy(kind);
      setError(null);
      try {
        const result = await action(controller.signal);
        return controller.signal.aborted ? undefined : result;
      } catch (reason) {
        if (controller.signal.aborted) return undefined;
        const failure = reason instanceof Error ? reason : new Error(String(reason));
        setError(failure);
        if (rethrow) throw failure;
        return undefined;
      } finally {
        if (active.current === controller) {
          active.current = null;
          setBusy(null);
        }
      }
    },
    [rethrow]
  );
  return {busy, error, setError, run, cancel};
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
type SucceededResult<K extends Operation['kind']> = Extract<Operation, {kind: K; status: 'succeeded'}>['result'];
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
  const onDisk = operation.status === 'failed' && (typeof details?.written === 'boolean' ? details.written : written) && details?.committed !== true;
  throw new LocalError(onDisk ? 'ui.writtenNotApplied' : 'ui.operationFailed', operation.error?.message ?? null, operation.error?.code ?? null, details);
}
// A warm TCP data probe over every reachable IP version; a group target probes its direct members, a node target
// must not name members.
export function tcpProbe(capabilities: Capabilities | undefined, target: ProbeRequest['target']): ProbeRequest | null {
  const probes = capabilities?.resources.probes;
  if (!probes?.available || !probes.kinds?.includes('tcp_connect') || !probes.transports?.includes('tcp') || !probes.targets?.includes(target.type))
    return null;
  const ipv4 = probes.ip_versions?.includes('ipv4');
  const ipv6 = probes.ip_versions?.includes('ipv6');
  if (!ipv4 && !ipv6) return null;
  const request: Omit<ProbeRequest, 'members'> & {members?: ProbeRequest['members']} = {
    target,
    kind: 'tcp_connect',
    purpose: 'data',
    transport: ['tcp'],
    warmth: 'warm',
    ip_version: ipv4 && ipv6 ? 'any' : ipv6 ? 'ipv6' : 'ipv4'
  };
  if (target.type === 'group') request.members = 'direct';
  // The generated type reads the contract's `default: direct` as "always present"; the contract itself forbids
  // the field on a node target.
  return request as ProbeRequest;
}
