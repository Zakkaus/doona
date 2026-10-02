import {nodeProbeSupport} from '../../dae/probes';
import type {Api} from '../api';
import type {Capabilities, GroupSelectionResult} from '../model';
import {ApiError} from '../error';
import * as fixtures from './fixtures/inventory';
import {observedAt} from './fixtures/clock';
import {found, createPager} from './common';
import {patchGroupConfig, probeMembers, probeResult, resolveLeaf} from './control';
import type {MockLifecycle} from './lifecycle';
import type {MockGeodataState} from './geodata';
import {activateInventory, writeGroupConfig} from './activation';
import {quote} from '../../dae/text';
import {quoteName} from '../../dae/groups';
import {readNodeEntries} from '../../dae/nodes';
import {readSubscriptionEntries} from '../../dae/subscriptions';

// The backend refuses a value the configuration cannot hold instead of altering it.
function configLine(format: () => string): string {
  try {
    return format();
  } catch {
    throw new ApiError(422, 'unsupported_value', 'The value cannot be written to the configuration');
  }
}

// Removal edits the main source only, as honk does.
const removedFromMain = (find: (text: string) => {from: number; to: number} | undefined) => (text: string) => {
  const entry = find(text);
  if (!entry) throw new ApiError(404, 'capability_not_supported', 'Only entries of the main source can be removed');
  const start = text.lastIndexOf('\n', entry.from - 1) + 1;
  const end = text.indexOf('\n', entry.to) + 1;
  const whole = /^[ \t\r]*$/.test(text.slice(start, entry.from)) && end > 0 && /^[ \t\r]*$/.test(text.slice(entry.to, end - 1));
  return whole ? text.slice(0, start) + text.slice(end) : text.slice(0, entry.from) + text.slice(entry.to);
};
type InventoryApi = Pick<
  Api,
  | 'nodes'
  | 'groups'
  | 'group'
  | 'selectGroup'
  | 'clearGroupOverride'
  | 'patchGroup'
  | 'startProbe'
  | 'providers'
  | 'refreshProvider'
  | 'createProvider'
  | 'deleteProvider'
  | 'createNode'
  | 'deleteNode'
  | 'geodata'
  | 'updateGeodata'
>;
export function createInventory(
  capabilities: Capabilities,
  count: number,
  {enqueue, log, pending}: Pick<MockLifecycle, 'enqueue' | 'log' | 'pending'>,
  advance: () => string,
  editSource: (edit: (text: string) => string, groupName?: string) => Promise<() => string>,
  interrupt: (groupId: string, network: 'tcp' | 'udp') => boolean,
  geodata: MockGeodataState,
  faults = false,
  acceptWrites = false
) {
  const nodePage = createPager('nodes');
  const providerPage = createPager('providers');
  const providers = structuredClone(fixtures.providers);
  const {nodes, groups} = fixtures.nodeFixtures(Number.isFinite(count) ? count : 120, faults);
  for (const provider of providers) provider.node_count = nodes.filter(n => n.provider_id === provider.id).length;
  // In the faults scenario the subscription host fails every fetch: the provider keeps its cached nodes as stale.
  if (faults)
    Object.assign(
      providers.find(provider => provider.id === 'harbor')!,
      {status: 'stale', last_error: fixtures.providerFault}
    );
  const revisions = new Map<string, bigint>();
  const updating = new Set<string>();
  const api: InventoryApi = {
    nodes: async (query, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.nodes.available) throw new ApiError(404, 'capability_not_supported', 'Nodes are unavailable');
      const result = nodePage(query?.group_id ? nodes.filter(n => n.group_ids.includes(query.group_id!)) : nodes, query);
      // Each read is a fresh probe round, as each runtime read is a fresh sample, so a latency line keeps moving.
      const probed = new Date().toISOString();
      const items = result.items.map(item => ({...item, health: item.health.map(row => ({...row, observed_at: probed}))}));
      return {observed_at: observedAt, nodes: items, next_cursor: result.next_cursor};
    },
    groups: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.groups.available) throw new ApiError(404, 'capability_not_supported', 'Groups are unavailable');
      return groups.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        config_revision: g.config_revision,
        policy: {...g.policy},
        member_count: g.members.length,
        selection: {tcp_member_id: g.runtime.selection.tcp?.member_id ?? null, udp_member_id: g.runtime.selection.udp?.member_id ?? null}
      }));
    },
    group: async (id, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.groups.available) throw new ApiError(404, 'capability_not_supported', 'Groups are unavailable');
      return structuredClone(
        found(
          groups.find(g => g.id === id),
          'Group'
        )
      );
    },
    selectGroup: async (groupId, request, signal) => {
      signal?.throwIfAborted();
      const group = found(
        groups.find(g => g.id === groupId),
        'Group'
      );
      // A selector takes the choice; an automatic policy takes it as a pin that stands until cleared.
      const override = !group.capabilities.can_select && group.capabilities.can_override;
      if (!group.capabilities.can_select && !override) throw new ApiError(422, 'unsupported_value', 'Group does not support manual selection');
      if (!group.members.some(m => m.id === request.member_id)) throw new ApiError(422, 'unsupported_value', 'Member is not in this group');
      const networks: Array<'tcp' | 'udp'> = request.network === 'both' ? ['tcp', 'udp'] : [request.network];
      let interrupted = false;
      for (const network of networks) {
        const previous = group.runtime.selection[network]?.member_id;
        group.runtime.selection[network] = {
          member_id: request.member_id,
          resolved_leaf_node_id: resolveLeaf(request.member_id, network, nodes, groups)?.id ?? null,
          source: override ? 'override' : 'runtime'
        };
        if (previous === request.member_id || !group.config.interrupt_connections) continue;
        interrupted = interrupt(groupId, network) || interrupted;
      }
      const revision = (revisions.get(groupId) ?? 0n) + 1n;
      revisions.set(groupId, revision);
      const result: GroupSelectionResult = {
        group_id: groupId,
        member_id: request.member_id,
        network: request.network,
        source: override ? 'override' : 'runtime',
        selection_revision: String(revision),
        connections_interrupted: interrupted
      };
      if (request.network !== 'both') result.resolved_leaf_node_id = group.runtime.selection[request.network]?.resolved_leaf_node_id;
      return result;
    },
    // Back to the policy's own pick: the pin goes and the member the policy last ranked first comes back.
    clearGroupOverride: async (groupId, network, signal) => {
      signal?.throwIfAborted();
      const group = found(
        groups.find(g => g.id === groupId),
        'Group'
      );
      if (!group.capabilities.can_override) throw new ApiError(409, 'state_conflict', 'Group has no override to clear');
      const networks: Array<'tcp' | 'udp'> = network === 'both' ? ['tcp', 'udp'] : [network];
      const chosen = fixtures.policyPick(group);
      for (const item of networks) {
        group.runtime.selection[item] = {member_id: chosen, resolved_leaf_node_id: resolveLeaf(chosen, item, nodes, groups)?.id ?? null, source: 'policy'};
      }
      const revision = (revisions.get(groupId) ?? 0n) + 1n;
      revisions.set(groupId, revision);
      return {
        group_id: groupId,
        network,
        selection_revision: String(revision),
        connections_interrupted: false,
        selection: structuredClone(group.runtime.selection)
      };
    },
    patchGroup: async (groupId, ops, ifMatch, signal) => {
      signal?.throwIfAborted();
      const group = found(
        groups.find(g => g.id === groupId),
        'Group'
      );
      if (!ops.length) throw new ApiError(400, 'invalid_request', 'A group patch must not be empty');
      const limit = capabilities.resources.groups.max_patch_operations;
      if (limit !== undefined && ops.length > limit) throw new ApiError(413, 'request_too_large', 'Too many patch operations');
      if (ifMatch !== '"' + group.config_revision + '"') throw new ApiError(412, 'stale_revision', 'Group configuration revision changed');
      if (updating.has(groupId)) throw new ApiError(409, 'state_conflict', 'Group update is pending');
      const updated = patchGroupConfig(group, ops);
      const activate = await editSource(text => writeGroupConfig(text, group.name, {...updated, members: group.members}), group.name);
      updating.add(groupId);
      return enqueue('group_update', () => {
        updating.delete(groupId);
        const revision = activate();
        return {group_id: groupId, config_revision: revision};
      });
    },
    startProbe: async (request, signal) => {
      signal?.throwIfAborted();
      const probes = capabilities.resources.probes;
      if (!probes.available) throw new ApiError(404, 'capability_not_supported', 'Probes are unavailable');
      if (request.target.type === 'node' && request.members !== undefined) throw new ApiError(400, 'invalid_request', 'Node probes must not specify members');
      const versions = request.ip_version === 'any' ? (['ipv4', 'ipv6'] as const) : [request.ip_version];
      if (
        !probes.targets?.includes(request.target.type) ||
        !probes.kinds?.includes(request.kind) ||
        request.transport.some(transport => !probes.transports?.includes(transport)) ||
        versions.some(version => !probes.ip_versions?.includes(version))
      )
        throw new ApiError(422, 'unsupported_value', 'Probe dimensions are not advertised');
      const target = request.target;
      const group =
        target.type === 'group'
          ? found(
              groups.find(g => g.id === target.group_id),
              'Group'
            )
          : undefined;
      if (target.type === 'node')
        found(
          nodes.find(n => n.id === target.node_id),
          'Node'
        );
      if (
        !request.transport.length ||
        request.transport.some(t => group && !group.capabilities.probe_transports.includes(t)) ||
        (request.kind !== 'dns' && request.transport.some(t => t !== 'tcp'))
      )
        throw new ApiError(422, 'unsupported_value', 'Unsupported probe dimensions');
      if (group && Array.isArray(request.members) && request.members.some(id => !group.members.some(m => m.id === id)))
        throw new ApiError(422, 'unsupported_value', 'Probe member is not in this group');
      const ids = probeMembers(request, nodes, groups);
      for (const id of ids) {
        for (const transport of request.transport) {
          const node = resolveLeaf(id, transport, nodes, groups);
          if (!node) continue;
          if (request.kind === 'tcp_connect' && (node.protocol === 'direct' || node.protocol === 'block'))
            throw new ApiError(422, 'unsupported_value', 'TCP connect probes do not apply to direct or block nodes');
          if (transport === 'udp' && nodeProbeSupport(node.protocol).udp === false)
            throw new ApiError(422, 'unsupported_value', 'The probed node does not carry UDP');
        }
      }
      const members = ids.length;
      const limits = probes.limits!;
      if (members > limits.max_members_per_job || members * request.transport.length * versions.length > limits.max_results_per_job)
        throw new ApiError(413, 'request_too_large', 'Probe exceeds the advertised member or result limit');
      const input = structuredClone(request);
      return enqueue('probe', () => probeResult(input, nodes, groups, new Date().toISOString()));
    },
    providers: async (query, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.providers.available) throw new ApiError(404, 'capability_not_supported', 'Providers are unavailable');
      const max = capabilities.resources.providers.max_page_size ?? 1000;
      if (query?.limit !== undefined && query.limit > max) throw new ApiError(400, 'invalid_request', `limit exceeds max_page_size ${max}`);
      const result = providerPage(providers, {...query, limit: query?.limit ?? Math.min(100, max)});
      return {providers: result.items, next_cursor: result.next_cursor};
    },
    // A refresh re-reads the source; the demo keeps the node set and moves the timestamps.
    refreshProvider: async (providerId, signal) => {
      signal?.throwIfAborted();
      const provider = found(
        providers.find(item => item.id === providerId),
        'Provider'
      );
      if (!capabilities.resources.providers.can_refresh || provider.kind !== 'subscription')
        throw new ApiError(404, 'capability_not_supported', 'This provider cannot be refreshed');
      if (updating.has('refresh:' + providerId)) throw new ApiError(409, 'state_conflict', 'A refresh for this provider is already queued or running');
      updating.add('refresh:' + providerId);
      return enqueue('provider_refresh', () => {
        updating.delete('refresh:' + providerId);
        if (faults && provider.id === 'harbor') {
          provider.last_error = structuredClone(fixtures.providerFault);
          log('warn', 'honk::subscription', 'Subscription fetch failed.', {provider: provider.name, error: fixtures.providerFault.code});
          throw new ApiError(502, fixtures.providerFault.code, fixtures.providerFault.message);
        }
        provider.updated_at = new Date().toISOString();
        provider.status = 'ok';
        provider.last_error = null;
        return structuredClone(provider);
      });
    },
    createProvider: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.providers.can_manage) throw new ApiError(404, 'capability_not_supported', 'Provider management is unavailable');
      if (!/^https?:\/\//.test(request.url)) throw new ApiError(422, 'unsupported_value', 'The subscription URL must start with http:// or https://');
      if (providers.some(item => item.name === request.name)) throw new ApiError(409, 'state_conflict', `A provider named ${request.name} already exists`);
      const url = URL.parse(request.url);
      if (!url) throw new ApiError(422, 'unsupported_value', 'The subscription URL cannot be parsed');
      const {update_interval: interval, user_agent: agent, cache} = request;
      const offered = capabilities.resources.providers.create_options ?? {};
      if (
        (['update_interval', 'user_agent', 'cache'] as const).some(key => request[key] !== undefined && offered[key] === undefined) ||
        (interval !== undefined && !(Number.isInteger(interval) && interval >= 0 && interval <= 31536000)) ||
        (agent !== undefined && !/^[\x20-\x7E]{1,256}$/.test(agent))
      )
        throw new ApiError(422, 'unsupported_value', 'The subscription options are not supported');
      // Like honk, an entry with options becomes a block; one without stays a scalar line.
      const fields = [
        agent !== undefined && `ua: ${quote(agent)}`,
        interval !== undefined && `interval: '${interval}s'`,
        cache !== undefined && `cache: ${cache}`
      ];
      const options = fields.filter(Boolean).map(field => `    ${field}\n`);
      const line = configLine(() =>
        options.length
          ? `  ${quoteName(request.name)}: {\n    url: ${quote(request.url)}\n${options.join('')}  }\n`
          : `  ${quoteName(request.name)}: ${quote(request.url)}\n`
      );
      const activate = await editSource(text => text.replace(/^(subscription \{\n)/m, `$1${line}`));
      log('info', 'honk::subscription', 'Subscription added.', {provider: request.name});
      const finish = () => {
        activate();
        return structuredClone(
          found(
            providers.find(provider => provider.name === request.name),
            'Provider'
          )
        );
      };
      return acceptWrites ? enqueue('provider_create', finish) : finish();
    },
    deleteProvider: async (providerId, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.providers.can_manage) throw new ApiError(404, 'capability_not_supported', 'Provider management is unavailable');
      const index = providers.findIndex(item => item.id === providerId);
      if (index < 0) return {deleted: 0};
      if (providers[index].kind === 'inline') throw new ApiError(404, 'capability_not_supported', 'The inline provider is the node section itself');
      const provider = providers[index];
      const activate = await editSource(removedFromMain(text => readSubscriptionEntries(text).find(entry => entry.tag === provider.name)));
      log('info', 'honk::subscription', 'Subscription removed.', {provider: provider.name});
      const finish = () => {
        activate();
        return {deleted: 1};
      };
      return acceptWrites ? enqueue('provider_delete', finish) : finish();
    },
    createNode: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.nodes.can_manage) throw new ApiError(404, 'capability_not_supported', 'Node management is unavailable');
      const scheme = /^([a-z][a-z0-9+.-]*):\/\/\S+$/i.exec(request.link.trim())?.[1]?.toLowerCase();
      if (!scheme || !fixtures.linkSchemes.includes(scheme)) throw new ApiError(422, 'unsupported_value', `Unsupported share link scheme "${scheme ?? ''}"`);
      if (nodes.some(n => n.name === request.name)) throw new ApiError(409, 'state_conflict', `An inline node named ${request.name} already exists`);
      const line = configLine(() => `  ${quote(request.name)}: ${quote(request.link.trim())}\n`);
      const activate = await editSource(text => text.replace(/^(node \{\n)/m, `$1${line}`));
      log('info', 'honk::config', 'Node added.', {node: request.name, protocol: scheme});
      const finish = () => {
        activate();
        return structuredClone(
          found(
            nodes.find(node => node.name === request.name),
            'Node'
          )
        );
      };
      return acceptWrites ? enqueue('node_create', finish) : finish();
    },
    deleteNode: async (nodeId, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.nodes.can_manage) throw new ApiError(404, 'capability_not_supported', 'Node management is unavailable');
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return {deleted: 0};
      if (node.provider_id !== 'inline')
        throw new ApiError(404, 'capability_not_supported', 'Only inline nodes can be deleted; refresh or delete the provider instead');
      const activate = await editSource(removedFromMain(text => readNodeEntries(text).find(entry => entry.name === node.name)));
      log('info', 'honk::config', 'Node removed.', {node: node.name});
      const finish = () => {
        activate();
        return {deleted: 1};
      };
      return acceptWrites ? enqueue('node_delete', finish) : finish();
    },
    geodata: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.geodata.available) throw new ApiError(404, 'capability_not_supported', 'Geodata is unavailable');
      return geodata.status();
    },
    updateGeodata: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.geodata.can_update) throw new ApiError(404, 'capability_not_supported', 'Geodata update is unavailable');
      if (pending('geodata_update')) throw new ApiError(409, 'state_conflict', 'A geodata update is already queued or running');
      return enqueue('geodata_update', () => {
        const result = geodata.update();
        log('info', 'honk::geodata', 'Geodata updated; reloading.', {assets: result.assets.map(a => a.kind)});
        advance();
        return result;
      });
    }
  };
  return {
    api,
    groupNames: () => new Set(groups.map(group => group.name)),
    groupIds: () => new Set(groups.map(group => group.id)),
    activate: (text: string, revision: string) => activateInventory(text, revision, nodes, groups, providers)
  };
}
