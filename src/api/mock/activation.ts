import type {Group, Node, Provider} from '../model';
import {blockFields, quote, scanConfig, unquote} from '../../dae/text';
import {groupAdmits, readGroupEntries, writeGroupEntry} from '../../dae/groups';

// The demo engine's view of a native policy expression: which contract kind it behaves as.
const policyKinds: Record<string, Group['policy']['kind']> = {
  select: 'selector',
  fixed: 'selector',
  urltest: 'urltest',
  min_moving_avg: 'urltest',
  min_avg10: 'urltest',
  min_last_delay: 'urltest',
  fallback: 'fallback',
  roundrobin: 'loadbalance',
  loadbalance: 'loadbalance',
  random: 'random',
  score: 'score'
};
function policyKind(native: string): Group['policy']['kind'] {
  return policyKinds[native.toLowerCase().replace(/\(.*$/, '')] ?? 'selector';
}

export function activateInventory(text: string, revision: string, nodes: Node[], groups: Group[], providers: Provider[]) {
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
  for (const field of subscriptions) {
    const url = URL.parse(unquote(field.value));
    const url_redacted = url ? url.origin + url.pathname + (url.search ? '?[redacted]' : '') : null;
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
  const entries = readGroupEntries(text);
  const memberships = new Map(nextNodes.map(node => [node.id, [] as string[]]));
  const nextGroups = entries.map((entry): Group => {
    const previous = groups.find(group => group.name === entry.name);
    const memberNodes = nextNodes.filter(node => groupAdmits(entry.filters, node));
    const members: Group['members'] = memberNodes.map(node => ({id: node.id, name: node.name, kind: 'node'}));
    for (const node of memberNodes) memberships.get(node.id)!.push(previous?.id ?? entry.name);
    const native = entry.policy ?? 'fixed(0)';
    const kind = policyKind(native);
    const config: Group['config'] = {
      default_member_id: null,
      final_outbound: null,
      check_url: null,
      check_interval: 30,
      tolerance: 10,
      idle_timeout: null,
      interrupt_connections: false
    };
    const block = blocks
      .filter(block => block.name === 'group')
      .flatMap(block => block.children)
      .find(block => block.name === entry.name)!;
    for (const field of blockFields(text, block, tokens)) {
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
    if (config.default_member_id === null && kind === 'selector')
      config.default_member_id = members[Number(/^fixed\((\d+)\)$/.exec(native)?.[1] ?? 0)]?.id ?? null;
    const selection: Group['runtime']['selection'] = {tcp: null, udp: null};
    for (const network of ['tcp', 'udp'] as const) {
      const old = previous?.runtime.selection[network];
      const id = old && members.some(member => member.id === old.member_id) ? old.member_id : (config.default_member_id ?? members[0]?.id);
      if (id) selection[network] = {member_id: id, resolved_leaf_node_id: id, source: kind === 'selector' ? 'runtime' : 'policy'};
    }
    return {
      id: previous?.id ?? entry.name,
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
      capabilities: {
        can_select: kind === 'selector',
        can_override: kind !== 'selector',
        supports_nested_groups: true,
        mutable_config: ['policy', 'default_member_id', 'check_interval', 'tolerance', 'interrupt_connections'],
        probe_transports: ['tcp', 'udp']
      }
    };
  });
  for (const node of nextNodes) node.group_ids = memberships.get(node.id)!;
  for (const provider of nextProviders) provider.node_count = nextNodes.filter(node => node.provider_id === provider.id).length;
  nodes.splice(0, nodes.length, ...nextNodes);
  groups.splice(0, groups.length, ...nextGroups);
  providers.splice(0, providers.length, ...nextProviders);
}

export function writeGroupConfig(text: string, name: string, update: Pick<Group, 'policy' | 'config'>): string {
  const entry = readGroupEntries(text).find(entry => entry.name === name)!;
  text = writeGroupEntry(text, name, {filters: entry.filters, policy: update.policy.native});
  const {blocks, tokens} = scanConfig(text);
  const block = blocks
    .filter(block => block.name === 'group')
    .flatMap(block => block.children)
    .find(block => block.name === name)!;
  const existing = blockFields(text, block, tokens).filter(field => field.name in update.config);
  const values = Object.entries(update.config)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? quote(value) : String(value)}`)
    .join('\n    ');
  text = text.slice(0, block.close) + '\n    ' + values + '\n  ' + text.slice(block.close);
  for (const field of existing.reverse()) text = text.slice(0, field.from) + text.slice(field.to);
  return text;
}
