import type {Capabilities} from './model';

// Every resource key the contract pinned here declares. A backend built against an earlier pin (the first
// honk release targets cb8ac07, before geodata and the management flags) simply omits the newer keys; they are
// filled in as unavailable so pages can read `resources.<key>.available` without guarding each one.
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
