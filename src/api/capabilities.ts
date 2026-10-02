import type {Capabilities, ReportedCapabilities} from './model';

// The contract reads an absent resource as unavailable; fill it in as such so callers need no guards.
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
  'dns_rules',
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

export function normalizeCapabilities(raw: ReportedCapabilities): Capabilities {
  const resources = {...raw.resources} as Record<string, unknown>;
  const unreported = resourceKeys.filter(key => !resources[key] || typeof resources[key] !== 'object');
  for (const key of unreported) resources[key] = {available: false};
  const extensions = Object.fromEntries(Object.entries(raw.resources).filter(([key]) => key.startsWith('x-')));
  return {...raw, extensions, resources: resources as Capabilities['resources'], unreported};
}

// Whether the backend offers a resource. `whileLoading` answers while the capabilities are absent, before they arrive
// or after they fail: a page's own resource starts at once (true), a resource that only enriches the page waits (false).
export function offered(
  resources: Capabilities['resources'] | undefined,
  key: keyof Capabilities['resources'],
  {whileLoading}: {whileLoading: boolean}
): boolean {
  return resources ? resources[key].available === true : whileLoading;
}
