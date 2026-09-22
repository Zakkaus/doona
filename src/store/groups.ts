import {useCallback, useState} from 'react';
import {getApi} from '../api/index';
import type {Capabilities, Group, GroupSelectionRequest, ProbeResult} from '../api/model';
import type {Api} from '../api/api';
import {LocalError} from '../api/error';
import {useResource} from './resource';
import {etag, finished, tcpProbe, useAction} from './action';
import {useCapabilities} from './runtime';
export async function probeGroup(api: Api, capabilities: Capabilities, group: Group, signal: AbortSignal): Promise<ProbeResult> {
  const request = tcpProbe(capabilities, {type: 'group', group_id: group.id});
  const limits = capabilities.resources.probes.limits;
  if (!request || !limits || !group.capabilities.probe_transports.includes('tcp')) throw new LocalError('ui.probeUnsupported');
  const dimensions = request.transport.length * (request.ip_version === 'any' ? 2 : 1);
  const size = Math.min(limits.max_members_per_job, Math.floor(limits.max_results_per_job / dimensions));
  if (size < 1 || !group.members.length) throw new LocalError('ui.probeUnsupported');
  let result: ProbeResult | undefined;
  try {
    for (let offset = 0; offset < group.members.length; offset += size) {
      signal.throwIfAborted();
      const members = group.members.slice(offset, offset + size).map(member => member.id);
      const accepted = await api.startProbe({...request, members}, signal);
      const batch = finished(await api.pollOperation(accepted, signal), 'probe');
      if (!result) result = batch;
      else {
        result.results.push(...batch.results);
        result.selection_after = batch.selection_after;
        result.selection_changed.tcp ||= batch.selection_changed.tcp;
        result.selection_changed.udp ||= batch.selection_changed.udp;
      }
    }
  } catch (error) {
    if (signal.aborted || !result) throw error;
    const completed = new Set(result.results.map(row => row.member_id)).size;
    throw Object.assign(
      new LocalError('ui.operationFailed', `${completed}/${group.members.length}; ${error instanceof Error ? error.message : String(error)}`),
      {partialResult: result}
    );
  }
  return result!;
}
export function useGroups(enabled = true) {
  const api = getApi();
  return useResource({key: ['groups'], every: 30000, fetch: signal => api.groups(signal)}, {enabled});
}
export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void, paused = false) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const resource = useResource({key: ['group', {id}], every: 30000, fetch: signal => api.group(id, signal)}, {paused});
  const {refetch} = resource;
  const [network, setNetwork] = useState<GroupSelectionRequest['network']>('both');
  const action = useAction<'selection' | 'probe' | 'config'>({scope: id});
  const {run: act} = action;
  // Every control changes what the lists show, so all three refetch once it has gone through.
  const run = useCallback(
    async <T>(kind: 'selection' | 'probe' | 'config', action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      const result = await act(kind, action);
      if (result !== undefined) {
        refetch();
        refetchGroups();
        refetchNodes();
      }
      return result;
    },
    [act, refetch, refetchGroups, refetchNodes]
  );
  // A TCP probe needs the backend to offer it and the group to accept it.
  const request = tcpProbe(capabilities, {type: 'group', group_id: id});
  const limits = capabilities?.resources.probes.limits;
  const canProbe =
    request !== null &&
    !!limits &&
    limits.max_members_per_job > 0 &&
    limits.max_results_per_job >= (request.ip_version === 'any' ? 2 : 1) &&
    !!resource.data?.members.length &&
    resource.data.capabilities.probe_transports.includes('tcp');
  return {
    ...resource,
    // The load error stays with the resource (shown inline); `actionError` is the last control that failed.
    actionError: action.error,
    network,
    setNetwork,
    busy: action.busy,
    canProbe,
    select: useCallback((member_id: string) => run('selection', signal => api.selectGroup(id, {member_id, network}, signal)), [api, id, network, run]),
    clearOverride: useCallback(() => run('selection', signal => api.clearGroupOverride(id, network, signal)), [api, id, network, run]),
    probe: useCallback(
      () =>
        run('probe', async signal => {
          if (!capabilities || !resource.data || !canProbe) throw new LocalError('ui.probeUnsupported');
          try {
            return await probeGroup(api, capabilities, resource.data, signal);
          } catch (error) {
            if (!signal.aborted) {
              refetch();
              refetchGroups();
              refetchNodes();
            }
            throw error;
          }
        }),
      [api, capabilities, resource.data, canProbe, run, refetch, refetchGroups, refetchNodes]
    ),
    setInterrupt: useCallback(
      (value: boolean) =>
        run('config', async signal => {
          if (!resource.data) throw new LocalError('ui.groupNotLoaded');
          const result = await api.patchGroup(id, [{op: 'replace', path: '/config/interrupt_connections', value}], etag(resource.data.config_revision), signal);
          if ('operation_id' in result) finished(await api.pollOperation(result, signal), 'group_update');
          return true;
        }),
      [api, id, resource.data, run]
    )
  };
}
