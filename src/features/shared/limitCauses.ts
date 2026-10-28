import {configManagement, engineOf, type EngineAction, type EngineReason} from '../../api/engines';
import type {Capabilities, RuntimeSettings, Version} from '../../api/model';

// The resources the overview's feature list shows, in its order.
const limitResources = [
  'connections',
  'flows',
  'routing_trace',
  'dns_query',
  'dns_cache',
  'dns_log',
  'events',
  'probes',
  'traffic_history',
  'memory_history',
  'runtime_outbounds',
  'logs',
  'providers',
  'rules',
  'config',
  'config_validate',
  'runtime_settings',
  'geodata'
] as const;
export type Resource = (typeof limitResources)[number];
// Resources the overview's feature list leaves out, listed here only when they are off.
const unlisted = ['dns_rules', 'reload', 'suspend', 'resume'] as const;
export type LimitId = Resource | (typeof unlisted)[number] | EngineAction;

// Why features are off, in the order the overview lists them.
const limitCauses = [
  'configNotLoaded',
  'configReadOnly',
  'mainReadOnly',
  'startFlag',
  'recordOff',
  'geodataUpdate',
  'stateDb',
  'geodataUnreadable',
  'notRunning',
  'flowsIdle',
  'notProvided'
] as const;
export type LimitCause = (typeof limitCauses)[number];
type LimitClass = {cause: LimitCause; ids: LimitId[]};

// The group a resource that is off joins by the engine's reason; one the engine gives no such reason for is not
// provided, or, for flows that are off, idle.
const reasonCause: Partial<Record<EngineReason['code'], LimitCause>> = {
  'recorder-off': 'recordOff',
  'starting-or-stopping': 'notRunning',
  'geodata-mismatch': 'geodataUnreadable',
  'config-unloaded': 'configNotLoaded',
  'writes-off': 'configReadOnly',
  'start-flag': 'startFlag',
  'state-db-closed': 'stateDb'
};

// The backend features that are off or limited, grouped by why, in the order the overview lists the causes. A feature
// appears in at most one group, and a resource absent from every group is available. The contract says what is off;
// the engine adapter adds why, where it knows.
export function classifyLimits(
  capabilities: Capabilities,
  version: Pick<Version, 'engine'> | undefined,
  recording?: RuntimeSettings['recording']
): LimitClass[] {
  const resources = capabilities.resources;
  const engine = engineOf(version);
  const reason = (id: LimitId) => engine.reason(id, capabilities, recording);
  const found = new Map<LimitCause, LimitId[]>();
  const add = (cause: LimitCause, id: LimitId) => {
    const ids = found.get(cause) ?? [];
    ids.push(id);
    found.set(cause, ids);
  };
  // An action that is off joins the group of the engine's reason, or is not provided; one no setting turns on is left
  // out, and an engine extension's action is listed only when the engine explains it. An extension the engine does not
  // report is not off.
  const action = (id: LimitId, off: boolean, explained = false) => {
    const given = off ? reason(id) : undefined;
    if (off && given?.code !== 'no-switch' && (given || !explained)) add((given && reasonCause[given.code]) ?? 'notProvided', id);
  };

  // Writing needs the sources loaded, so a configuration that is not loaded is also not writable (honk config.rs
  // writable, can_manage); node management and geodata updates need writes too and share the configuration's cause.
  const configCause: LimitCause | null = !resources.config.available ? 'configNotLoaded' : resources.config.writable !== true ? 'configReadOnly' : null;
  if (configCause) add(configCause, 'config');
  // honk config.rs running: validation needs the sources loaded too, so it shares that cause and no other.
  const validateUnloaded = !resources.config_validate.available && configCause === 'configNotLoaded';
  if (validateUnloaded) add('configNotLoaded', 'config_validate');
  if (resources.nodes.can_manage === false || resources.providers.can_manage === false) add(configCause ?? 'mainReadOnly', 'manage');
  // The other writes share the configuration's cause too: creating sources, the forms and the rule and group editors.
  const write = (id: LimitId, off: boolean) => off && add(configCause ?? 'notProvided', id);
  write('create', resources.config.available && resources.config.create === false);
  write('global_settings', configCause !== null && engine.globalSettings !== null);
  write('mode', configCause !== null && engine.daeText);
  write('rule_edit', configCause !== null && resources.rules.available);
  write('group_edit', resources.groups.available && resources.groups.config_patch === false);
  const management = configManagement(capabilities);
  for (const id of ['export', 'import', 'revisions'] as const) action(id, management.off[id], true);
  action('restore', management.revisions && !management.canActivate, true);
  const lacking = (list: readonly string[] | undefined, value: string) => list !== undefined && !list.includes(value);
  action('validate_full', resources.config_validate.available && lacking(resources.config_validate.modes, 'full'));
  action('selection', resources.groups.available && resources.groups.selection === false);
  action('trace_live', resources.routing_trace.available && lacking(resources.routing_trace.resolve_modes, 'live'));
  const cache = resources.dns_cache;
  action('dns_cache_read', cache.available && cache.read === false);
  action('dns_cache_delete', cache.available && cache.delete_entry === false);
  action('dns_cache_flush', cache.available && cache.flush === false);
  action('geodata_settings', resources.geodata.available && resources.geodata.configurable_sources !== true);

  for (const id of limitResources) {
    const resource = resources[id];
    if (id === 'config' || (id === 'config_validate' && validateUnloaded)) continue;
    // Flows stay available with recording off or on demand; both join the flows group, which tells them apart.
    const flowsOff = id === 'flows' && resource.available && (resources.flows.recording === 'off' || resources.flows.recording === 'auto');
    const forbidden = (id === 'flows' || id === 'logs' || id === 'dns_log') && recording?.[id]?.allowed === false;
    if (forbidden || flowsOff || !resource.available) {
      const code = reason(id)?.code;
      add((code && reasonCause[code]) ?? (flowsOff ? 'flowsIdle' : 'notProvided'), id);
    } else {
      if (id === 'geodata' && resources.geodata.can_update !== true) add(configCause ?? 'geodataUpdate', id);
      if (id === 'providers' && resources.providers.can_refresh === false) add('notRunning', 'subscriptions');
      if (id === 'connections' && resources.connections.can_close === false) add('notProvided', 'close');
    }
  }
  for (const id of unlisted) action(id, !resources[id].available);
  return limitCauses.flatMap(cause => {
    const ids = found.get(cause);
    return ids ? [{cause, ids}] : [];
  });
}

// How many features are off or limited: the items the overview lists.
export const limitCount = (capabilities: Capabilities, version: Pick<Version, 'engine'> | undefined, recording?: RuntimeSettings['recording']): number =>
  classifyLimits(capabilities, version, recording).reduce((n, group) => n + group.ids.length, 0);
