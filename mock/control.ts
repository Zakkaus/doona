import {nodeProbeSupport} from '../src/dae/probes';
import type {Group, HealthObservation, JsonPatch, Node, ProbeRequest, ProbeResult} from '../src/api/model';
import {ApiError} from '../src/api/error';
import {policyKindLabels, safeHttpUrl} from '../src/api/selectors';

export function resolveLeaf(id: string, network: 'tcp' | 'udp', nodes: Node[], groups: Group[], seen = new Set<string>()): Node | undefined {
  const node = nodes.find(n => n.id === id);
  if (node) return node;
  if (seen.has(id)) return undefined;
  seen.add(id);
  const selection = groups.find(g => g.id === id)?.runtime.selection[network];
  return selection ? resolveLeaf(selection.member_id, network, nodes, groups, seen) : undefined;
}

export function probeMembers(request: ProbeRequest, nodes: Node[], groups: Group[]): string[] {
  const target = request.target;
  const group = target.type === 'group' ? groups.find(g => g.id === target.group_id) : undefined;
  let ids = target.type === 'node' ? [target.node_id] : group!.members.map(m => m.id);
  const members = request.members;
  if (Array.isArray(members)) ids = ids.filter(id => members.includes(id));
  if (request.members === 'leaves') {
    const leaves = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      if (nodes.some(n => n.id === id)) leaves.add(id);
      else groups.find(g => g.id === id)?.members.forEach(m => visit(m.id));
    };
    ids.forEach(visit);
    ids = [...leaves];
  }
  return ids;
}

export function probeResult(request: ProbeRequest, nodes: Node[], groups: Group[], observed_at: string): ProbeResult {
  const target = request.target;
  const group = target.type === 'group' ? groups.find(g => g.id === target.group_id) : undefined;
  const selection = {tcp: group?.runtime.selection.tcp?.member_id ?? null, udp: group?.runtime.selection.udp?.member_id ?? null};
  const ids = probeMembers(request, nodes, groups);
  // The kind fixes the purpose; the request no longer carries it.
  const purpose = request.kind === 'dns' ? 'dns' : 'data';
  const results: ProbeResult['results'] = [];
  for (const member_id of ids)
    for (const transport of request.transport) {
      const node = resolveLeaf(member_id, transport, nodes, groups);
      const versions: Array<'ipv4' | 'ipv6'> = request.ip_version === 'any' ? ['ipv4', 'ipv6'] : [request.ip_version];
      for (const ip_version of versions) {
        const previous = node?.health.find(h => h.transport === transport && h.ip_version === ip_version);
        const support = nodeProbeSupport(node?.protocol ?? null);
        const usable = request.kind === 'tcp_connect' ? support.connect : support.stream;
        const latency_ms = usable && previous?.state === 'healthy' ? previous.latency_ms : null;
        const state = latency_ms === null ? 'unavailable' : 'healthy';
        const warmth = latency_ms === null ? 'unknown' : request.kind === 'http' ? request.warmth : 'cold';
        // A success folds into both averages, the 10-sample one as a tenth so the mock keeps no window; a failure
        // reports neither.
        const fold = (average: number | null | undefined, weight: number) =>
          latency_ms === null ? null : average == null ? latency_ms : average + (latency_ms - average) * weight;
        const error = state === 'unavailable' ? 'probe_failed' : null;
        const observation: HealthObservation = {
          transport,
          purpose,
          ip_version,
          warmth,
          measurement: request.kind === 'http' ? 'http_headers' : request.kind === 'dns' ? 'dns_round_trip' : 'tcp_connect',
          sample_source: 'probe',
          state,
          latency_ms,
          moving_avg_ms: fold(previous?.moving_avg_ms, 1 / 2),
          avg10_ms: fold(previous?.avg10_ms, 1 / 10),
          observed_at,
          error
        };
        if (node) {
          const index = node.health.findIndex(
            h =>
              h.transport === transport &&
              h.purpose === purpose &&
              h.ip_version === ip_version &&
              h.warmth === warmth &&
              h.measurement === observation.measurement
          );
          if (index < 0) node.health.push(observation);
          else node.health[index] = observation;
        }
        if (group) {
          // honk keeps averages to node rows; a group's own samples carry none.
          const health = {
            ...observation,
            moving_avg_ms: null,
            avg10_ms: null,
            member_id,
            resolved_leaf_node_id: node?.id ?? null,
            sorting_latency_ms: latency_ms,
            ranking: null
          };
          const index = group.runtime.health.findIndex(
            h =>
              h.member_id === member_id &&
              h.transport === transport &&
              h.purpose === purpose &&
              h.ip_version === ip_version &&
              h.warmth === warmth &&
              h.measurement === observation.measurement
          );
          if (index < 0) group.runtime.health.push(health);
          else group.runtime.health[index] = health;
        }
        results.push({
          member_id,
          resolved_leaf_node_id: node?.id ?? null,
          kind: request.kind,
          purpose,
          transport,
          ip_version,
          warmth,
          state,
          latency_ms,
          health_updated: !!node,
          error,
          observed_at
        });
      }
    }
  return {target, results, selection_before: selection, selection_after: {...selection}, selection_changed: {tcp: false, udp: false}};
}

export function patchGroupConfig(group: Group, ops: JsonPatch): Pick<Group, 'policy' | 'config'> {
  const document: Record<string, unknown> = {'/policy': structuredClone(group.policy)};
  for (const [key, value] of Object.entries(group.config)) document['/config/' + key] = value;
  const mutable = (path: string) => group.capabilities.mutable_config.some(key => path === (key === 'policy' ? '/policy' : '/config/' + key));
  const missing = (path: string) => {
    if (!(path in document)) throw new ApiError(400, 'invalid_request', 'Patch path does not exist');
  };
  for (const op of ops) {
    if (!mutable(op.path) || ('from' in op && !mutable(op.from))) throw new ApiError(422, 'unsupported_value', 'Group field is not mutable');
    if (op.op !== 'add' && op.op !== 'copy' && op.op !== 'move') missing(op.path);
    if (op.op === 'test') {
      if (JSON.stringify(document[op.path]) !== JSON.stringify(op.value)) throw new ApiError(409, 'state_conflict', 'Patch test failed');
    } else if (op.op === 'remove') delete document[op.path];
    else if ('from' in op) {
      missing(op.from);
      const value = document[op.from];
      if (op.op === 'move') delete document[op.from];
      document[op.path] = structuredClone(value);
    } else document[op.path] = structuredClone(op.value);
  }
  const policy = document['/policy'] ?? {kind: 'selector', native: 'selector'};
  if (
    typeof policy !== 'object' ||
    policy === null ||
    !('kind' in policy) ||
    !Object.hasOwn(policyKindLabels, String(policy.kind)) ||
    !('native' in policy) ||
    typeof policy.native !== 'string'
  )
    throw new ApiError(422, 'unsupported_value', 'Invalid group policy');
  const config = Object.fromEntries(Object.keys(group.config).map(key => [key, document['/config/' + key] ?? null])) as Group['config'];
  for (const key of ['check_interval', 'tolerance', 'idle_timeout'] as const) {
    const value = config[key];
    if (value !== null && (!Number.isSafeInteger(value) || value < (key === 'check_interval' ? 1 : 0)))
      throw new ApiError(422, 'unsupported_value', 'Invalid group interval or tolerance');
  }
  if (config.interrupt_connections !== null && typeof config.interrupt_connections !== 'boolean')
    throw new ApiError(422, 'unsupported_value', 'Invalid interruption setting');
  for (const key of ['default_member_id', 'final_outbound', 'check_url'] as const)
    if (config[key] !== null && typeof config[key] !== 'string') throw new ApiError(422, 'unsupported_value', 'Invalid group configuration value');
  if (config.default_member_id !== null && !group.members.some(m => m.id === config.default_member_id))
    throw new ApiError(422, 'unsupported_value', 'Default member is not in this group');
  if (config.check_url !== null && !safeHttpUrl(config.check_url)) throw new ApiError(422, 'unsupported_value', 'Invalid check URL');
  return {policy: policy as Group['policy'], config};
}
