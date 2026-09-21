import {useState} from 'react';
import {getApi} from '../index';
import type {Api} from '../api';
import type {Capabilities, Operation, Runtime, RuntimeSettings, RuntimeSettingsPatch} from '../model';
import {useResource} from './resource';
import {finished, useAction} from './action';
export function useVersion() {
  const api = getApi();
  return useResource({key: ['version'], fetch: signal => api.version(signal)}, {deps: [api], every: 0});
}
export function useRuntime(enabled = true) {
  const api = getApi();
  return useResource({key: ['runtime'], fetch: signal => api.runtime(signal)}, {deps: [api], enabled});
}
export function useRuntimeOutbounds(enabled: boolean) {
  const api = getApi();
  return useResource({key: ['runtimeOutbounds'], fetch: signal => api.runtimeOutbounds(signal)}, {deps: [api], enabled});
}
// The backend's ring, asked for the chart's window (or as much of it as the backend keeps) at its full
// resolution: the live window wants every second the backend has.
export function useTrafficHistory(windowSeconds: number, capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.traffic_history;
  const window_seconds = Math.min(windowSeconds, limits?.max_window_seconds ?? 600);
  const max_points = Math.min(600, limits?.max_points ?? 600);
  return useResource(
    {key: ['trafficHistory', {window_seconds, max_points}], fetch: signal => api.trafficHistory({window_seconds, max_points}, signal)},
    {
      deps: [api, window_seconds, max_points],
      enabled: limits?.available === true
    }
  );
}
// Ten minutes at the recorder cadence; the chart shows what the producer retained, not a local accumulation.
export function useMemoryHistory(capabilities: Capabilities | undefined) {
  const api = getApi();
  const limits = capabilities?.resources.memory_history;
  const window_seconds = Math.min(600, limits?.max_window_seconds ?? 600);
  const max_points = Math.min(120, limits?.max_points ?? 120);
  return useResource(
    {key: ['memoryHistory', {window_seconds, max_points}], fetch: signal => api.memoryHistory({window_seconds, max_points}, signal)},
    {deps: [api, window_seconds, max_points], enabled: limits?.available === true}
  );
}
export function useCapabilities() {
  const api = getApi();
  return useResource({key: ['capabilities'], fetch: signal => api.capabilities(signal)}, {deps: [api], every: 0});
}
export function useDatapath(enabled = true) {
  const api = getApi();
  return useResource({key: ['datapath', {detail: 'full'}], fetch: signal => api.datapath('full', signal)}, {deps: [api], enabled});
}
// A write reply replaces the cached settings until a newer poll arrives, preventing a flash of stale values. Replies are scoped to their backend.
const newest = <T extends {observed_at: string}>(written: T | null, polled: T | undefined) =>
  written && (!polled || Date.parse(written.observed_at) >= Date.parse(polled.observed_at)) ? written : polled;
export function useRuntimeSettings(enabled = true) {
  const api = getApi();
  const resource = useResource({key: ['runtimeSettings'], fetch: signal => api.runtimeSettings(signal)}, {deps: [api], enabled});
  const {busy, run} = useAction<'save'>({rethrow: true});
  const [saved, setSaved] = useState<{api: Api; value: RuntimeSettings} | null>(null);
  const save = (patch: RuntimeSettingsPatch) =>
    run('save', async signal => {
      const next = await api.patchRuntimeSettings(patch, signal);
      setSaved({api, value: next});
      resource.refetch();
      return next;
    });
  return {...resource, data: newest(saved?.api === api ? saved.value : null, resource.data), busy: busy !== null, save};
}
export function useRuntimeMemory(enabled = true) {
  const api = getApi();
  return useResource({key: ['runtimeMemory'], fetch: signal => api.runtimeMemory(signal)}, {deps: [api], enabled});
}
type RuntimeAction = 'reload' | 'suspend' | 'resume';
export function useRuntimeOperations(runtime: Runtime | undefined, capabilities: Capabilities | undefined, refetch: () => void) {
  const api = getApi();
  const action = useAction<RuntimeAction>({rethrow: true});
  const canRun = (kind: RuntimeAction) =>
    !!runtime &&
    !!capabilities?.resources.operations.available &&
    !!capabilities.resources[kind].available &&
    (kind === 'reload' || runtime.lifecycle.state === (kind === 'suspend' ? 'running' : 'suspended'));
  const run = (kind: RuntimeAction) => {
    if (!canRun(kind)) return Promise.resolve(undefined);
    return action.run(kind, async signal => {
      const accepted = await (kind === 'reload' ? api.startReload : kind === 'suspend' ? api.startSuspend : api.startResume)(signal);
      const terminal = await api.pollOperation(accepted, signal);
      refetch();
      finished(terminal, kind);
      return terminal as Extract<Operation, {status: 'succeeded'}>;
    });
  };
  return {busy: action.busy, error: action.error, canRun, run};
}
