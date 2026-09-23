import type {Capabilities} from './model';

// Backends omit resources added after their contract pin; fill them as unavailable so callers need no guards.
const resourceKeys = [
  'config',
  'config_validate',
  'runtime',
  'runtime_memory',
  'runtime_outbounds',
  'traffic_history',
  'memory_history',
  'datapath',
  'nodes',
  'providers',
  'groups',
  'probes',
  'connections',
  'flows',
  'routing_trace',
  'rules',
  'events',
  'logs',
  'dns_query',
  'dns_cache',
  'dns_log',
  'runtime_settings',
  'geodata',
  'operations',
  'reload',
  'suspend',
  'resume'
] as const satisfies ReadonlyArray<keyof Capabilities['resources']>;

export function normalizeCapabilities(raw: Capabilities): Capabilities {
  const resources = {...raw.resources} as Record<string, unknown>;
  for (const key of resourceKeys) if (!resources[key] || typeof resources[key] !== 'object') resources[key] = {available: false};
  return {...raw, resources: resources as Capabilities['resources']};
}

// Whether the backend offers a resource. `whileLoading` answers before capabilities arrive: a page's own resource
// starts at once (true), a resource that only enriches the page waits for the answer (false).
export function offered(
  resources: Capabilities['resources'] | undefined,
  key: keyof Capabilities['resources'],
  {whileLoading}: {whileLoading: boolean}
): boolean {
  return resources ? resources[key].available === true : whileLoading;
}
