import type {ApiEvent, EventKind} from './model';

export type ResourceName =
  | 'capabilities'
  | 'version'
  | 'runtime'
  | 'runtimeOutbounds'
  | 'trafficHistory'
  | 'memoryHistory'
  | 'connections'
  | 'nodes'
  | 'groups'
  | 'group'
  | 'flows'
  | 'flow'
  | 'datapath'
  | 'runtimeMemory'
  | 'dnsCache'
  | 'dnsLog'
  | 'runtimeSettings'
  | 'config'
  | 'providers'
  | 'geodata'
  | 'rules';

// Event schemas do not define cross-resource invalidation, so the UI owns this policy.
export const invalidations: Record<EventKind, {now: ResourceName[] | 'all'; poll: ResourceName[]}> = {
  'stream.ready': {now: 'all', poll: []},
  'runtime.updated': {
    now: ['runtime', 'runtimeOutbounds', 'trafficHistory', 'memoryHistory', 'connections'],
    poll: ['nodes', 'groups', 'group']
  },
  'flow.updated': {now: ['flows', 'flow', 'connections'], poll: []},
  'flow.gap': {now: ['flows', 'flow'], poll: []},
  'operation.updated': {now: ['runtime'], poll: []},
  'generation.changed': {
    now: ['capabilities', 'runtime', 'runtimeSettings', 'config', 'groups', 'group', 'nodes', 'providers', 'geodata', 'rules', 'datapath', 'flows', 'flow'],
    poll: ['dnsCache']
  }
};

export function shouldRefetch(resource: ResourceName, event: Pick<ApiEvent, 'event'>, reconnected = false): boolean {
  if (!Object.hasOwn(invalidations, event.event) || (event.event === 'stream.ready' && !reconnected)) return false;
  const {now} = invalidations[event.event];
  return now === 'all' || now.includes(resource);
}
