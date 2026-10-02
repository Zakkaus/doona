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
  // The leaf protocols under a group's nested groups, read from the group resources and refreshed with them.
  | 'groupProbeProtocols'
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

// The contract's Invalidates column (events.md). An operation's own changes arrive as the `runtime.updated` or
// `generation.changed` they produce, and its waiter refetches the operation, so `operation.updated` refreshes nothing here.
export const invalidations: Record<EventKind, {now: ResourceName[] | 'all'}> = {
  'stream.ready': {now: 'all'},
  'runtime.updated': {
    now: [
      'runtime',
      'runtimeOutbounds',
      'trafficHistory',
      'memoryHistory',
      'runtimeMemory',
      'runtimeSettings',
      'capabilities',
      'groups',
      'group',
      'groupProbeProtocols',
      'nodes',
      'connections'
    ]
  },
  'flow.updated': {now: ['flows', 'flow']},
  'flow.gap': {now: ['flows', 'flow']},
  'operation.updated': {now: []},
  'generation.changed': {
    now: [
      'capabilities',
      'runtime',
      'runtimeSettings',
      'config',
      'groups',
      'group',
      'groupProbeProtocols',
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
