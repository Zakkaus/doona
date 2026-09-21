import {useState} from 'react';
import {getApi} from '../index';
import type {GroupSelectionRequest} from '../model';
import {LocalError} from '../error';
import {useResource} from './resource';
import {etag, finished, tcpProbe, useAction} from './action';
import {useCapabilities} from './runtime';
export function useGroups(enabled = true) {
  const api = getApi();
  return useResource({key: ['groups'], fetch: signal => api.groups(signal)}, {deps: [api], every: 30000, enabled});
}
export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const resource = useResource({key: ['group', {id}], fetch: signal => api.group(id, signal)}, {deps: [api, id], every: 30000});
  const [network, setNetwork] = useState<GroupSelectionRequest['network']>('both');
  const action = useAction<'selection' | 'probe' | 'config'>({scope: id});
  // Every control changes what the lists show, so all three refetch once it has gone through.
  async function run<T>(kind: 'selection' | 'probe' | 'config', act: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const result = await action.run(kind, act);
    if (result !== undefined) {
      resource.refetch();
      refetchGroups();
      refetchNodes();
    }
    return result;
  }
  // A TCP probe needs the backend to offer it and the group to accept it.
  const canProbe = tcpProbe(capabilities, {type: 'group', group_id: id}) !== null && (resource.data?.capabilities.probe_transports.includes('tcp') ?? false);
  return {
    ...resource,
    // The load error stays with the resource (shown inline); `actionError` is the last control that failed.
    error: resource.error,
    actionError: action.error,
    network,
    setNetwork,
    busy: action.busy,
    canProbe,
    select: (member_id: string) => run('selection', signal => api.selectGroup(id, {member_id, network}, signal)),
    clearOverride: () => run('selection', signal => api.clearGroupOverride(id, network, signal)),
    probe: () =>
      run('probe', async signal => {
        const request = tcpProbe(capabilities, {type: 'group', group_id: id});
        if (!request || !canProbe) throw new LocalError('ui.probeUnsupported');
        const accepted = await api.startProbe(request, signal);
        return finished(await api.pollOperation(accepted, signal), 'probe');
      }),
    setInterrupt: (value: boolean) =>
      run('config', async signal => {
        if (!resource.data) throw new LocalError('ui.groupNotLoaded');
        const result = await api.patchGroup(id, [{op: 'replace', path: '/config/interrupt_connections', value}], etag(resource.data.config_revision), signal);
        if ('operation_id' in result) finished(await api.pollOperation(result, signal), 'group_update');
        return true;
      })
  };
}
