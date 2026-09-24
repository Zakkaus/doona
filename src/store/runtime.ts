import {useCallback, useState} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {Capabilities, Operation, Runtime, RuntimeSettings, RuntimeSettingsPatch} from '../api/model';
import {useResource} from './resource';
import {finished, useAction} from './action';
export function useVersion() {
  const api = getApi();
  return useResource({key: ['version'], every: 0, fetch: signal => api.version(signal)});
}
export function useRuntime(enabled = true) {
  const api = getApi();
  return useResource({key: ['runtime'], fetch: signal => api.runtime(signal)}, {enabled});
}
export function useRuntimeOutbounds(enabled: boolean) {
  const api = getApi();
  return useResource({key: ['runtimeOutbounds'], fetch: signal => api.runtimeOutbounds(signal)}, {enabled});
}
// The backend's ring, asked for the chart's window (or as much of it as the backend keeps) at its full
// resolution: the live window wants every second the backend has. The runtime poll extends it between the
// once-a-minute refreshes, and a range change or reconnect fetches it again.
export function useTrafficHistory(windowSeconds: number, capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.traffic_history;
  const window_seconds = Math.min(windowSeconds, limits?.max_window_seconds ?? 600);
  const max_points = Math.min(600, limits?.max_points ?? 600);
  return useResource(
    {key: ['trafficHistory', {window_seconds, max_points}], every: 60000, fetch: signal => api.trafficHistory({window_seconds, max_points}, signal)},
    {
      enabled: limits?.available === true
    }
  );
}
// The backend's memory ring over ten minutes at the recorder cadence, refreshed once a minute; the chart merges it
// with the session's own samples (useMemorySamples).
export function useMemoryHistory(capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.memory_history;
  const window_seconds = Math.min(600, limits?.max_window_seconds ?? 600);
  const max_points = Math.min(120, limits?.max_points ?? 120);
  return useResource(
    {key: ['memoryHistory', {window_seconds, max_points}], every: 60000, fetch: signal => api.memoryHistory({window_seconds, max_points}, signal)},
    {enabled: limits?.available === true}
  );
}
export function useCapabilities() {
  const api = getApi();
  return useResource({key: ['capabilities'], every: 0, retryErrors: true, followEvents: false, fetch: signal => api.capabilities(signal)});
}
export function useDatapath(enabled = true) {
  const api = getApi();
  return useResource({key: ['datapath', {detail: 'full'}], fetch: signal => api.datapath('full', signal)}, {enabled});
}
// A write reply stands in for the cached settings until a newer poll, so stale values do not flash; replies are
// kept per backend.
const newest = <T extends {observed_at: string}>(written: T | null, polled: T | undefined) =>
  written && (!polled || Date.parse(written.observed_at) >= Date.parse(polled.observed_at)) ? written : polled;
export function useRuntimeSettings(enabled = true) {
  const api = getApi();
  const resource = useResource(
    {
      key: ['runtimeSettings'],
      fetch: signal => api.runtimeSettings(signal),
      acceptEvent: event => event.event !== 'operation.updated' || event.data.status === 'succeeded' || event.data.status === 'failed'
    },
    {enabled}
  );
  const {refetch} = resource;
  const {busy, run} = useAction<'save'>({rethrow: true});
  const [saved, setSaved] = useState<{api: Api; value: RuntimeSettings} | null>(null);
  const save = useCallback(
    (patch: RuntimeSettingsPatch) =>
      run('save', async signal => {
        const next = await api.patchRuntimeSettings(patch, signal);
        setSaved({api, value: next});
        refetch();
        return next;
      }),
    [api, run, refetch]
  );
  return {...resource, data: newest(saved?.api === api ? saved.value : null, resource.data), busy: busy !== null, save};
}
export function useRuntimeMemory(enabled = true) {
  const api = getApi();
  return useResource({key: ['runtimeMemory'], fetch: signal => api.runtimeMemory(signal)}, {enabled});
}
type RuntimeAction = 'reload' | 'suspend' | 'resume';
export function useRuntimeOperations(runtime: Runtime | undefined, capabilities: Capabilities | undefined, refetch: () => void) {
  const api = getApi();
  const action = useAction<RuntimeAction>({rethrow: true});
  const {run: act} = action;
  const canRun = useCallback(
    (kind: RuntimeAction) =>
      !!runtime &&
      !!capabilities?.resources.operations.available &&
      !!capabilities.resources[kind].available &&
      (kind === 'reload' || runtime.lifecycle.state === (kind === 'suspend' ? 'running' : 'suspended')),
    [runtime, capabilities]
  );
  const run = useCallback(
    (kind: RuntimeAction) => {
      if (!canRun(kind)) return Promise.resolve(undefined);
      return act(kind, async signal => {
        const accepted = await (kind === 'reload' ? api.startReload : kind === 'suspend' ? api.startSuspend : api.startResume)(signal);
        const terminal = await api.pollOperation(accepted, signal);
        refetch();
        finished(terminal, kind);
        return terminal as Extract<Operation, {status: 'succeeded'}>;
      });
    },
    [api, act, canRun, refetch]
  );
  return {busy: action.busy, error: action.error, canRun, run};
}
