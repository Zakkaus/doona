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
export const invalidations: Record<EventKind, {now: ResourceName[] | 'all'}> = {
  'stream.ready': {now: 'all'},
  'runtime.updated': {
    now: ['runtime', 'runtimeOutbounds']
  },
  'flow.updated': {now: ['flows', 'flow', 'connections']},
  'flow.gap': {now: ['flows', 'flow']},
  'operation.updated': {now: ['runtime']},
  'generation.changed': {
    now: ['capabilities', 'runtime', 'runtimeSettings', 'config', 'groups', 'group', 'nodes', 'providers', 'geodata', 'rules', 'datapath', 'flows', 'flow']
  }
};

export function shouldRefetch(resource: ResourceName, event: Pick<ApiEvent, 'event'>, reconnected = false): boolean {
  if (!Object.hasOwn(invalidations, event.event) || (event.event === 'stream.ready' && !reconnected)) return false;
  const {now} = invalidations[event.event];
  return now === 'all' || now.includes(resource);
}
