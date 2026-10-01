import {useCallback, useMemo} from 'react';
import {poll} from './cadence';
import {getApi} from '../api/index';
import type {Capabilities, Group, GroupSelectionRequest, JsonPatch, ProbeResult} from '../api/model';
import type {Api} from '../api/api';
import {ApiError, LocalError} from '../api/error';
import {useResource} from './resource';
import {activationError, etag, finished, settle, latencyProbe, useAction} from './action';
import {useSharedControl} from './sharedControl';
import {useCapabilities} from './runtime';
// A probe refused after some batches finished: the batches that did finish, and the error that stopped the rest.
export type PartialProbeError = LocalError & {cause: unknown; partialResult: ProbeResult; completed: number; total: number};
export async function probeGroup(api: Api, capabilities: Capabilities, group: Group, signal: AbortSignal): Promise<ProbeResult> {
  const request = latencyProbe(capabilities, {type: 'group', group_id: group.id});
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
      const batch = finished(await settle(api, accepted, signal), 'probe');
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
    // The batch's own error stays as `cause`, so the caller renders it translated next to the counts.
    throw Object.assign(new LocalError('ui.operationFailed'), {
      cause: error,
      partialResult: result,
      completed: new Set(result.results.map(row => row.member_id)).size,
      total: group.members.length
    });
  }
  return result!;
}
// Applies patch ops at the group's current configuration revision and waits for the reload that applies them. A 200
// answers with the config document only; the caller refetches the group.
export async function patchConfig(api: Api, group: Group, ops: JsonPatch, signal?: AbortSignal): Promise<void> {
  const result = await api.patchGroup(group.id, ops, etag(group.config_revision), signal).catch(error => {
    throw activationError(error) ?? error;
  });
  if ('operation_id' in result) finished(await settle(api, result, signal), 'group_update', {written: true});
}
// A config write refused because the group changed first: 412 for the revision it carried, 409 for a test op or an
// update still in flight. Either way the group is read again, and the check dialog moves its draft onto it.
export function groupConflict(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 412);
}
// honk offers selection and config writes for groups as a whole (resources.groups) and for each group (its capabilities);
// the group shows only the actions both offer, and none until capabilities load. The contract lists both top-level
// flags whenever groups are available, so an absent one leaves the group's own flags in charge.
export function groupActions(group: Group, capabilities: Capabilities | undefined): Group {
  const groups = capabilities?.resources.groups;
  const selection = !!groups?.available && groups.selection !== false;
  const patch = !!groups?.available && groups.config_patch !== false;
  if (selection && patch) return group;
  const {can_select, can_override, mutable_config} = group.capabilities;
  return {
    ...group,
    capabilities: {
      ...group.capabilities,
      can_select: selection && can_select,
      can_override: selection && can_override,
      mutable_config: patch ? mutable_config : []
    }
  };
}
// A page that shows each group's selection asks for a faster cadence than the inventory's.
export function useGroups(enabled = true, every: number = poll.inventory) {
  const api = getApi();
  return useResource({key: ['groups'], every, fetch: signal => api.groups(signal)}, {enabled});
}
export function useGroupControl(id: string, refetchGroups: () => void, refetchNodes: () => void, paused = false) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const resource = useResource({key: ['group', {id}], every: poll.inventory, fetch: signal => api.group(id, signal)}, {paused});
  const {refetch} = resource;
  const data = useMemo(() => resource.data && groupActions(resource.data, capabilities), [resource.data, capabilities]);
  const [network, setNetwork] = useSharedControl<GroupSelectionRequest['network']>(`group-network:${id}`, 'both');
  const action = useAction<'selection' | 'probe' | 'config'>({shared: `group-action:${id}`});
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
  const request = latencyProbe(capabilities, {type: 'group', group_id: id});
  const limits = capabilities?.resources.probes.limits;
  const canProbe =
    request !== null &&
    !!limits &&
    limits.max_members_per_job > 0 &&
    limits.max_results_per_job >= (request.ip_version === 'any' ? 2 : 1) &&
    !!resource.data?.members.length &&
    resource.data.capabilities.probe_transports.includes('tcp');
  const patch = useCallback(
    (ops: JsonPatch) =>
      run('config', async signal => {
        if (!resource.data) throw new LocalError('ui.groupNotLoaded');
        try {
          await patchConfig(api, resource.data, ops, signal);
        } catch (error) {
          // Someone else changed the group first: fetch it, so the next attempt carries the current revision and the
          // check dialog can show what the group holds now.
          if (groupConflict(error)) refetch();
          throw error;
        }
        return true as const;
      }),
    [api, resource.data, run, refetch]
  );
  return {
    ...resource,
    data,
    // The load error stays with the resource (shown inline); `actionError` is the last control that failed.
    actionError: action.error,
    network,
    setNetwork,
    busy: action.busy,
    canProbe,
    select: useCallback((member_id: string) => run('selection', signal => api.selectGroup(id, {member_id, network}, signal)), [api, id, network, run]),
    clearOverride: useCallback((scope = network) => run('selection', signal => api.clearGroupOverride(id, scope, signal)), [api, id, network, run]),
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
    patchConfig: patch,
    // Turning off a value the group never set clears it again rather than writing false.
    setInterrupt: useCallback(
      (value: boolean) =>
        patch([{op: 'replace', path: '/config/interrupt_connections', value: value || resource.data?.config.interrupt_connections !== null ? value : null}]),
      [patch, resource.data]
    )
  };
}
