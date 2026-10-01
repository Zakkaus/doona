import type {Group, Node, Provider} from '../model';
import {uuid} from '../hash';
import {blockFields, quote, scanConfig, unquote} from '../../dae/text';
import {groupAdmits, nestedIn, nameText, readGroupEntries, writeGroupEntry} from '../../dae/groups';
import {policyKind} from '../../dae/vocab';
import {readSubscriptionEntries} from '../../dae/subscriptions';
import {displayUrl} from './common';
import {groupCapabilities, groupConfig} from './groupDefaults';
import {resolveLeaf} from './control';

export function activateInventory(
  text: string,
  revision: string,
  nodes: Node[],
  groups: Group[],
  providers: Provider[],
  newGroupId: (name: string) => string = uuid
) {
  const {blocks, tokens} = scanConfig(text);
  const fields = (section: string) => blocks.filter(block => block.name === section).flatMap(block => blockFields(text, block, tokens));
  const subscriptions = fields('subscription');
  const providerIds = new Set(subscriptions.map(field => field.name));
  const inline = fields('node');
  const inlineNames = new Set(inline.map(field => field.name));
  const nextNodes = nodes.filter(node => (node.provider_id === 'inline' ? inlineNames.has(node.name) : providerIds.has(node.provider_id!)));
  for (const field of inline) {
    const protocol = unquote(field.value).split(':')[0];
    const existing = nextNodes.find(node => node.provider_id === 'inline' && node.name === field.name);
    if (existing) existing.protocol = protocol;
    else nextNodes.push({id: field.name, name: field.name, protocol, provider_id: 'inline', subscription_tag: null, group_ids: [], health: []});
  }
  const nextProviders = providers.filter(provider => provider.kind === 'inline' || providerIds.has(provider.name));
  // A block entry (`tag: {url: …}`) carries its URL as a field of that block.
  const blockUrl = (name: string) =>
    blocks
      .filter(block => block.name === 'subscription')
      .flatMap(block => block.children.filter(child => child.name === name))
      .flatMap(child => blockFields(text, child, tokens))
      .find(field => field.name === 'url')?.value;
  for (const field of subscriptions) {
    const url_redacted = displayUrl(unquote(blockUrl(field.name) ?? field.value));
    const existing = nextProviders.find(provider => provider.name === field.name);
    if (existing) {
      existing.url_redacted = url_redacted;
      continue;
    }
    nextProviders.push({
      id: field.name,
      name: field.name,
      kind: 'subscription',
      url_redacted,
      node_count: 0,
      updated_at: null,
      expires_at: null,
      traffic: null,
      status: 'stale',
      last_error: null
    });
  }
  const declarations = readGroupEntries(text);
  // Only the last declaration of a name is visible, in configuration order.
  const entries = declarations.filter((entry, index) => !declarations.slice(index + 1).some(later => later.name === entry.name));
  const ids = new Map(entries.map(entry => [entry.name, groups.find(group => group.name === entry.name)?.id ?? newGroupId(entry.name)]));
  const memberships = new Map(nextNodes.map(node => [node.id, [] as string[]]));
  const nextGroups = entries.map((entry): Group => {
    const previous = groups.find(group => group.name === entry.name);
    const memberNodes = nextNodes.filter(node => groupAdmits(entry.filters, node));
    const members: Group['members'] = [
      ...nestedIn(entry)
        .filter(name => entries.some(group => group.name === name))
        .map(name => ({id: ids.get(name)!, name, kind: 'group' as const})),
      ...memberNodes.map(node => ({id: node.id, name: node.name, kind: 'node' as const}))
    ];
    for (const node of memberNodes) memberships.get(node.id)!.push(ids.get(entry.name)!);
    const native = entry.policy ?? 'fixed(0)';
    const kind = policyKind(native) ?? 'selector';
    const config = groupConfig(kind);
    const block = blocks
      .filter(block => block.name === 'group')
      .flatMap(block => block.children)
      .filter(block => block.name === entry.name)
      .at(-1)!;
    for (const field of blockFields(text, block, tokens)) {
      // honk's own keys: `default` names a member by its tag, `final` an outbound.
      if (field.name === 'default') config.default_member_id = members.find(member => member.name === unquote(field.value))?.id ?? null;
      if (field.name === 'final') config.final_outbound = unquote(field.value);
      if (!(field.name in config)) continue;
      const value = unquote(field.value);
      Object.assign(config, {
        [field.name]:
          value === 'null'
            ? null
            : field.name === 'interrupt_connections'
              ? value === 'true'
              : ['check_interval', 'tolerance', 'idle_timeout'].includes(field.name)
                ? Number(value)
                : value
      });
    }
    // Without a default, a fixed policy starts on the member it numbers.
    const fastest =
      kind !== 'selector'
        ? memberNodes
            .filter(node => node.health.some(h => h.transport === 'tcp' && h.state === 'healthy'))
            .sort(
              (a, b) =>
                (a.health.find(h => h.transport === 'tcp')?.latency_ms ?? Infinity) - (b.health.find(h => h.transport === 'tcp')?.latency_ms ?? Infinity)
            )[0]?.id
        : undefined;
    const fixed = kind === 'selector' ? members[Number(/^fixed\((\d+)\)$/.exec(native)?.[1] ?? 0)]?.id : undefined;
    const selection: Group['runtime']['selection'] = {tcp: null, udp: null};
    for (const network of ['tcp', 'udp'] as const) {
      const old = previous?.runtime.selection[network];
      const id = old && members.some(member => member.id === old.member_id) ? old.member_id : (config.default_member_id ?? fixed ?? fastest ?? members[0]?.id);
      if (id) selection[network] = {member_id: id, resolved_leaf_node_id: id, source: kind === 'selector' ? 'runtime' : 'policy'};
    }
    return {
      id: ids.get(entry.name)!,
      name: entry.name,
      icon: previous?.icon ?? null,
      config_revision: revision,
      policy: {kind, native},
      config,
      members,
      runtime: {
        selection,
        health: memberNodes.flatMap(node =>
          node.health.map(health => ({...health, member_id: node.id, resolved_leaf_node_id: node.id, sorting_latency_ms: health.latency_ms, ranking: null}))
        )
      },
      capabilities: groupCapabilities(kind)
    };
  });
  for (const group of nextGroups) {
    for (const network of ['tcp', 'udp'] as const) {
      const selection = group.runtime.selection[network];
      if (selection) selection.resolved_leaf_node_id = resolveLeaf(selection.member_id, network, nextNodes, nextGroups)?.id ?? null;
    }
  }
  for (const node of nextNodes) node.group_ids = memberships.get(node.id)!;
  for (const provider of nextProviders) provider.node_count = nextNodes.filter(node => node.provider_id === provider.id).length;
  // Like honk, a subscription reports the route its fetches take: empty or `routing` follows the rules, `direct` goes
  // straight out, and anything else names a group.
  const routes = new Map(readSubscriptionEntries(text).map(entry => [entry.tag, entry.route]));
  for (const provider of nextProviders) {
    if (provider.kind !== 'subscription') continue;
    const route = routes.get(provider.name) || 'routing';
    provider.download =
      route === 'routing' || route === 'direct'
        ? {route, group_id: null}
        : {route: 'group', group_id: nextGroups.find(group => group.name === route)?.id ?? null};
  }
  nodes.splice(0, nodes.length, ...nextNodes);
  groups.splice(0, groups.length, ...nextGroups);
  providers.splice(0, providers.length, ...nextProviders);
}

export function writeGroupConfig(text: string, name: string, update: Pick<Group, 'policy' | 'config' | 'members'>): string {
  const entry = readGroupEntries(text)
    .filter(entry => entry.name === name)
    .at(-1)!;
  // The API's default_member_id and final_outbound are the native `default` member tag and `final` outbound.
  const {default_member_id, final_outbound, ...config} = update.config;
  const member = update.members.find(member => member.id === default_member_id)?.name ?? null;
  text = writeGroupEntry(text, name, {
    filters: entry.filters,
    policy: update.policy.native,
    default: nameText(member, entry.default),
    final: nameText(final_outbound, entry.final)
  });
  const {blocks, tokens} = scanConfig(text);
  const block = blocks
    .filter(block => block.name === 'group')
    .flatMap(block => block.children)
    .filter(block => block.name === name)
    .at(-1)!;
  const existing = blockFields(text, block, tokens).filter(field => field.name in config);
  const values = Object.entries(config)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? quote(value) : String(value)}`)
    .join('\n    ');
  text = text.slice(0, block.close) + '\n    ' + values + '\n  ' + text.slice(block.close);
  for (const field of existing.reverse()) text = text.slice(0, field.from) + text.slice(field.to);
  return text;
}
