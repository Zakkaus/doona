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
  | 'rules'
  | 'dnsRules';

// Event schemas do not define cross-resource invalidation, so the UI owns this policy.
export const invalidations: Record<EventKind, {now: ResourceName[] | 'all'}> = {
  'stream.ready': {now: 'all'},
  'runtime.updated': {
    now: ['runtime', 'runtimeOutbounds']
  },
  'flow.updated': {now: ['flows', 'flow', 'connections']},
  'flow.gap': {now: ['flows', 'flow']},
  // Every activation restores runtime settings, and a no-op one advances no generation.
  'operation.updated': {now: ['runtime', 'runtimeSettings']},
  'generation.changed': {
    now: [
      'capabilities',
      'runtime',
      'runtimeSettings',
      'config',
      'groups',
      'group',
      'nodes',
      'providers',
      'geodata',
      'rules',
      'dnsRules',
      'datapath',
      'flows',
      'flow'
    ]
  }
};

// `reconnected` is true after a ready that may follow a gap, or lists the kinds a filter change may have held back.
export type Reconnected = boolean | readonly EventKind[];
export function shouldRefetch(resource: ResourceName, event: Pick<ApiEvent, 'event'>, reconnected: Reconnected = false): boolean {
  if (event.event === 'stream.ready' && Array.isArray(reconnected)) return reconnected.some(kind => shouldRefetch(resource, {event: kind}));
  if (!Object.hasOwn(invalidations, event.event) || (event.event === 'stream.ready' && !reconnected)) return false;
  const {now} = invalidations[event.event];
  return now === 'all' || now.includes(resource);
}
