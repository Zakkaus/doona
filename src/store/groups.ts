import {useCallback, useState} from 'react';
import {getApi} from '../api/index';
import type {GroupSelectionRequest} from '../api/model';
import {LocalError} from '../api/error';
import {useResource} from './resource';
import {etag, finished, tcpProbe, useAction} from './action';
import {useCapabilities} from './runtime';
export function useGroups(enabled = true) {
  const api = getApi();
  return useResource({key: ['groups'], every: 30000, fetch: signal => api.groups(signal)}, {enabled});
}
export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const resource = useResource({key: ['group', {id}], every: 30000, fetch: signal => api.group(id, signal)});
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
  const canProbe = tcpProbe(capabilities, {type: 'group', group_id: id}) !== null && (resource.data?.capabilities.probe_transports.includes('tcp') ?? false);
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
          const request = tcpProbe(capabilities, {type: 'group', group_id: id});
          if (!request || !canProbe) throw new LocalError('ui.probeUnsupported');
          const accepted = await api.startProbe(request, signal);
          return finished(await api.pollOperation(accepted, signal), 'probe');
        }),
      [api, id, capabilities, canProbe, run]
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
