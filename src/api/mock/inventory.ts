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

// The backend refuses a value the configuration cannot hold instead of altering it.
function configLine(format: () => string): string {
  try {
    return format();
  } catch {
    throw new ApiError(422, 'unsupported_value', 'The value cannot be written to the configuration');
  }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  editMain: (edit: (text: string) => string) => Promise<() => string>,
  interrupt: (groupId: string, network: 'tcp' | 'udp') => boolean,
  geodata: MockGeodataState
) {
  const nodePage = createPager('nodes');
  const providerPage = createPager('providers');
  const providers = structuredClone(fixtures.providers);
  const {nodes, groups} = fixtures.nodeFixtures(Number.isFinite(count) ? count : 120);
  for (const provider of providers) provider.node_count = nodes.filter(n => n.provider_id === provider.id).length;
  const revisions = new Map<string, bigint>();
  const updating = new Set<string>();
  const api: InventoryApi = {
    nodes: async (query, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.nodes.available) throw new ApiError(404, 'capability_not_supported', 'Nodes are unavailable');
      const result = nodePage(query?.group_id ? nodes.filter(n => n.group_ids.includes(query.group_id!)) : nodes, query);
      return {observed_at: observedAt, nodes: result.items, next_cursor: result.next_cursor};
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
      if (!group.capabilities.can_select && !override) throw new ApiError(404, 'capability_not_supported', 'Group does not support manual selection');
      found(
        group.members.find(m => m.id === request.member_id),
        'Group member'
      );
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
      if (ifMatch !== '"' + group.config_revision + '"') throw new ApiError(412, 'stale_revision', 'Group configuration revision changed');
      if (updating.has(groupId)) throw new ApiError(409, 'state_conflict', 'Group update is pending');
      const limit = capabilities.resources.groups.max_patch_operations;
      if (limit !== undefined && ops.length > limit) throw new ApiError(413, 'request_too_large', 'Too many patch operations');
      const updated = patchGroupConfig(group, ops);
      const activate = await editMain(text => writeGroupConfig(text, group.name, updated));
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
      const versions = request.ip_version === 'any' ? (['ipv4', 'ipv6'] as const) : [request.ip_version];
      if (
        !probes.targets?.includes(request.target.type) ||
        !probes.kinds?.includes(request.kind) ||
        !probes.purposes?.includes(request.purpose) ||
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
        (request.kind !== 'dns' && (request.purpose !== 'data' || request.transport.some(t => t !== 'tcp'))) ||
        (request.kind === 'dns' && request.purpose !== 'dns')
      )
        throw new ApiError(422, 'unsupported_value', 'Unsupported probe dimensions');
      if (group && Array.isArray(request.members) && request.members.some(id => !group.members.some(m => m.id === id)))
        throw new ApiError(422, 'unsupported_value', 'Probe member is not in this group');
      const members = probeMembers(request, nodes, groups).length;
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
      const fields = [agent !== undefined && `ua: ${quote(agent)}`, interval !== undefined && `interval: '${interval}s'`, cache !== undefined && `cache: ${cache}`];
      const options = fields.filter(Boolean).map(field => `    ${field}\n`);
      const line = configLine(() =>
        options.length
          ? `  ${quoteName(request.name)}: {\n    url: ${quote(request.url)}\n${options.join('')}  }\n`
          : `  ${quoteName(request.name)}: ${quote(request.url)}\n`
      );
      const activate = await editMain(text => text.replace(/^(subscription \{\n)/m, `$1${line}`));
      log('info', 'honk::subscription', 'Subscription added.', {provider: request.name});
      activate();
      return structuredClone(
        found(
          providers.find(provider => provider.name === request.name),
          'Provider'
        )
      );
    },
    deleteProvider: async (providerId, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.providers.can_manage) throw new ApiError(404, 'capability_not_supported', 'Provider management is unavailable');
      const index = providers.findIndex(item => item.id === providerId);
      if (index < 0) return {deleted: 0};
      if (providers[index].kind === 'inline') throw new ApiError(404, 'capability_not_supported', 'The inline provider is the node section itself');
      const provider = providers[index];
      const name = escapeRegExp(provider.name);
      const activate = await editMain(text => text.replace(new RegExp(`^\\s*${name}:\\s*\\{\\n[\\s\\S]*?\\n\\s*\\}\\n|^\\s*${name}:.*\\n`, 'm'), ''));
      log('info', 'honk::subscription', 'Subscription removed.', {provider: provider.name});
      activate();
      return {deleted: 1};
    },
    createNode: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.nodes.can_manage) throw new ApiError(404, 'capability_not_supported', 'Node management is unavailable');
      const scheme = /^([a-z][a-z0-9+.-]*):\/\/\S+$/i.exec(request.link.trim())?.[1]?.toLowerCase();
      if (!scheme || !fixtures.linkSchemes.includes(scheme)) throw new ApiError(422, 'unsupported_value', `Unsupported share link scheme "${scheme ?? ''}"`);
      if (nodes.some(n => n.name === request.name)) throw new ApiError(409, 'state_conflict', `An inline node named ${request.name} already exists`);
      const line = configLine(() => `  ${quote(request.name)}: ${quote(request.link.trim())}\n`);
      const activate = await editMain(text => text.replace(/^(node \{\n)/m, `$1${line}`));
      log('info', 'honk::config', 'Node added.', {node: request.name, protocol: scheme});
      activate();
      return structuredClone(
        found(
          nodes.find(node => node.name === request.name),
          'Node'
        )
      );
    },
    deleteNode: async (nodeId, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.nodes.can_manage) throw new ApiError(404, 'capability_not_supported', 'Node management is unavailable');
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return {deleted: 0};
      if (node.provider_id !== 'inline')
        throw new ApiError(404, 'capability_not_supported', 'Only inline nodes can be deleted; refresh or delete the provider instead');
      const activate = await editMain(text => text.replace(new RegExp(`^\\s*'${escapeRegExp(node.name)}':.*\\n`, 'm'), ''));
      log('info', 'honk::config', 'Node removed.', {node: node.name});
      activate();
      return {deleted: 1};
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
