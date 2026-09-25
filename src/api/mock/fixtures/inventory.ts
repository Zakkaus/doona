import type {Group, HealthObservation, Node, Provider, GeoData} from '../../model';
import {ago, now, observedAt} from './clock';
import {groupPolicies} from './configuration';
import {defaultGeodataPreset} from '../../../dae/geodata';
function health(transport: 'tcp' | 'udp', latency: number | null, ip_version: 'ipv4' | 'ipv6' = 'ipv4'): HealthObservation {
  return {
    transport,
    purpose: transport === 'tcp' ? 'data' : 'dns',
    ip_version,
    warmth: 'warm',
    measurement: transport === 'tcp' ? 'tcp_connect' : 'dns_round_trip',
    sample_source: 'probe',
    state: latency === null ? 'unavailable' : 'healthy',
    latency_ms: latency,
    // The averages differ from the latest sample, as they do on a live backend.
    moving_avg_ms: latency === null ? null : Math.round(latency * (0.8 + (latency % 7) / 15)),
    avg10_ms: latency === null ? null : Math.round(latency * (0.85 + (latency % 5) / 10)),
    observed_at: observedAt,
    error: latency === null ? 'timeout' : null
  };
}
function node(name: string, tcp: number | null, udp: number | null, v6: boolean, source: string, protocol: Node['protocol'] = 'shadowsocks'): Node {
  return {
    id: name,
    name,
    protocol,
    subscription_tag: source,
    provider_id: source === 'inline' ? 'inline' : source,
    group_ids: [],
    health: [health('udp', udp), health('tcp', tcp), ...(v6 ? [health('tcp', tcp, 'ipv6')] : [])]
  };
}
export function policyPick(group: Group): string {
  const ranked = group.runtime.health
    .filter(h => h.state === 'healthy' && h.transport === 'tcp' && h.latency_ms != null)
    .sort((a, b) => a.latency_ms! - b.latency_ms!);
  return ranked[0]?.member_id ?? group.members[0].id;
}
function group(name: keyof typeof groupPolicies, members: string[], leaf: string, nodes: Node[]): Group {
  const policy = groupPolicies[name];
  const {kind} = policy;
  const memberIds = new Set(members);
  const nodeIds = new Set(nodes.map(node => node.id));
  for (const n of nodes) if (memberIds.has(n.id)) n.group_ids.push(name);
  const selection = {member_id: leaf, resolved_leaf_node_id: leaf, source: kind === 'selector' ? 'runtime' : 'policy'};
  return {
    id: name,
    name,
    icon: null,
    config_revision: '40',
    policy: {...policy},
    members: members.map(id => ({id, name: id, kind: nodeIds.has(id) ? 'node' : 'group'})),
    config: {
      default_member_id: kind === 'selector' ? leaf : null,
      final_outbound: null,
      check_url: null,
      check_interval: 30,
      tolerance: 10,
      idle_timeout: null,
      interrupt_connections: false
    },
    runtime: {
      // The proxy group selects different members per network so the TCP/UDP switch has something to show.
      selection: {
        tcp: selection,
        udp: name === 'proxy' && memberIds.has('hk-02') ? {...selection, member_id: 'hk-02', resolved_leaf_node_id: 'hk-02'} : {...selection}
      },
      health: nodes
        .filter(n => memberIds.has(n.id))
        .flatMap(n => n.health.map(h => ({...h, member_id: n.id, resolved_leaf_node_id: n.id, sorting_latency_ms: h.latency_ms, ranking: null})))
    },
    capabilities: {
      can_select: kind === 'selector',
      can_override: kind !== 'selector',
      supports_nested_groups: true,
      mutable_config: ['policy', 'default_member_id', 'check_interval', 'tolerance', 'interrupt_connections'],
      probe_transports: ['tcp', 'udp']
    }
  };
}
export function nodeFixtures(count: number): {nodes: Node[]; groups: Group[]} {
  const nodes = [
    // The inline nodes match the links in the mock's config.dae.
    node('hk-01', 84, 91, true, 'inline', 'vless'),
    node('hk-02', 91, 88, true, 'inline', 'vless'),
    node('sg-01', 63, 70, false, 'inline', 'trojan'),
    node('jp-01', null, null, false, 'inline', 'vless'),
    node('us-01', 188, 201, true, 'inline', 'anytls')
  ];
  const groups = [
    group('proxy', ['hk-01', 'hk-02', 'sg-01', 'jp-01', 'us-01', 'resilient'], 'hk-01', nodes),
    group('resilient', ['hk-01', 'sg-01', 'us-01'], 'sg-01', nodes),
    group('gaming', ['jp-01', 'hk-02'], 'hk-02', nodes)
  ];
  const regions: Array<[string, number]> = [
    ['香港', 60],
    ['台灣', 40],
    ['日本', 30],
    ['新加坡', 40],
    ['美國', 160],
    ['韓國', 50],
    ['英國', 120],
    ['德國', 130],
    ['澳洲', 150],
    ['土耳其', 170]
  ];
  const tags = ['IPLC', 'BGP', '家寬', '解鎖', '0.5x', '2x', '流媒體', ''];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const airport: Node[] = [];
  for (let i = 0; i < count; i++) {
    const [region, base] = regions[i % regions.length];
    const n = String(Math.floor(i / regions.length) + 1).padStart(2, '0');
    const tag = tags[Math.floor(rnd() * tags.length)];
    const alive = rnd() > 0.06;
    const tcp = Math.round(base + rnd() * base * 0.8);
    const udp = alive ? tcp + Math.round(rnd() * 20) : null;
    airport.push(node(region + ' ' + n + (tag ? ' ' + tag : ''), alive ? tcp : null, udp, rnd() > 0.5, 'sub-c'));
  }
  if (airport.length) {
    nodes.push(...airport);
    groups.push(
      group(
        'skylink',
        airport.map(n => n.id),
        airport[0].id,
        nodes
      )
    );
  }
  return {nodes, groups};
}
export const providers: Provider[] = [
  {
    id: 'sub-c',
    name: 'sub-c',
    kind: 'subscription',
    url_redacted: 'https://sub.example.net/api/v1/client/subscribe?token=<redacted>',
    node_count: 120,
    updated_at: ago(1800),
    expires_at: new Date(now + 23 * 86400 * 1000).toISOString(),
    traffic: {upload_bytes: '48318382080', download_bytes: '412316860416', total_bytes: '1099511627776'},
    status: 'ok',
    last_error: null
  },
  {
    id: 'inline',
    name: 'config.dae',
    kind: 'inline',
    url_redacted: null,
    node_count: 5,
    updated_at: ago(3600),
    expires_at: null,
    traffic: null,
    status: 'ok',
    last_error: null
  }
];
// Share-link schemes the demo accepts on POST /nodes, as dae's own parser does.
export const linkSchemes = ['vless', 'vmess', 'trojan', 'trojan-go', 'ss', 'ssr', 'socks5', 'http', 'https', 'hysteria2', 'hy2', 'tuic', 'juicity', 'anytls'];
// The loaded files came from the built-in MetaCubeX sources three days ago; automatic updates are off.
export const geodata: GeoData = {
  observed_at: observedAt,
  assets: [
    {
      kind: 'geosite',
      sha256: '3f5a9c1e7b2d4c6a8e0f1b3d5a7c9e1f3b5d7a9c1e3f5a7b9d1c3e5f7a9b1d3c',
      size_bytes: '4404019',
      modified_at: ago(3 * 86400),
      source_redacted: defaultGeodataPreset.urls.geosite[0],
      fetched_url_redacted: defaultGeodataPreset.urls.geosite[0],
      verified: true,
      download_route: {route: 'routing', group_id: null}
    },
    {
      kind: 'geoip',
      sha256: '9b1d3c5e7f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e',
      size_bytes: '17406771',
      modified_at: ago(3 * 86400),
      source_redacted: defaultGeodataPreset.urls.geoip[0],
      fetched_url_redacted: defaultGeodataPreset.urls.geoip[1],
      verified: true,
      download_route: {route: 'routing', group_id: null}
    }
  ],
  last_checked_at: ago(3 * 86400),
  last_updated_at: ago(3 * 86400),
  next_check_at: null,
  last_error: null,
  required_codes: {geosite: [], geoip: []}
};
