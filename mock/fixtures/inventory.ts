import type {Group, HealthObservation, Node, Provider, GeoData} from '../../src/api/model';
import {ago, now, observedAt} from './clock';
import {configMain} from './configuration';
import {activateInventory} from '../activation';
import {resolveLeaf} from '../control';
import {defaultGeodataPreset} from '../../src/dae/geodata';
// `drift` sets the moving and 10-sample averages as multiples of the latest latency, so a node can be slower or faster
// now than on average.
function health(transport: 'tcp' | 'udp', latency: number | null, drift: [number, number], ip_version: 'ipv4' | 'ipv6' = 'ipv4'): HealthObservation {
  const average = (factor: number) => (latency === null ? null : Math.round(latency * factor * 10) / 10);
  return {
    transport,
    purpose: transport === 'tcp' ? 'data' : 'dns',
    ip_version,
    warmth: 'warm',
    measurement: transport === 'tcp' ? 'tcp_connect' : 'dns_round_trip',
    sample_source: 'probe',
    state: latency === null ? 'unavailable' : 'healthy',
    latency_ms: latency,
    // honk leaves both averages null on an unavailable row, and names a failed probe with this code.
    moving_avg_ms: average(drift[0]),
    avg10_ms: average(drift[1]),
    observed_at: observedAt,
    error: latency === null ? 'probe_failed' : null
  };
}
function node(
  name: string,
  tcp: number | null,
  udp: number | null,
  v6: boolean,
  source: string,
  protocol: Node['protocol'] = 'shadowsocks',
  drift: [number, number] = [1, 1]
): Node {
  return {
    id: name,
    name,
    protocol,
    subscription_tag: source,
    provider_id: source === 'inline' ? 'inline' : source,
    group_ids: [],
    health: [health('udp', udp, drift), health('tcp', tcp, drift), ...(v6 ? [health('tcp', tcp, drift, 'ipv6')] : [])]
  };
}
export function policyPick(group: Group): string {
  const ranked = group.runtime.health
    .filter(h => h.state === 'healthy' && h.transport === 'tcp' && h.latency_ms != null)
    .sort((a, b) => a.latency_ms! - b.latency_ms!);
  return ranked[0]?.member_id ?? group.members[0].id;
}
// Every node answers its probes unless the faults scenario takes jp-01 and about one subscription node in sixteen down;
// one subscription node in fifty has never been probed.
export function nodeFixtures(count: number, faults = false): {nodes: Node[]; groups: Group[]} {
  const nodes = [
    // The inline nodes match the links in the mock's config.dae.
    node('hk-01', 84, 91, true, 'inline', 'vless', [0.95, 1.04]),
    node('hk-02', 91, 88, true, 'inline', 'vless', [1.12, 1.18]),
    node('sg-01', 63, 70, false, 'inline', 'trojan', [0.98, 1.02]),
    node('jp-01', faults ? null : 132, faults ? null : 139, false, 'inline', 'vless', [0.86, 0.9]),
    node('us-01', 188, 201, true, 'inline', 'anytls', [0.62, 0.7])
  ];
  // A UDP data probe besides the TCP and DNS ones on hk-01 and sg-01; the faults scenario fails sg-01's.
  nodes[0].health.push({...health('udp', 97, [1, 1]), purpose: 'data', measurement: 'quic_handshake'});
  nodes[2].health.push({...health('udp', faults ? null : 76, [1, 1]), purpose: 'data', measurement: 'quic_handshake'});
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
  // A second sequence for the averages, so adding them left every other fixture value as it was.
  let wobble = 11;
  const drift = (): [number, number] => {
    wobble = (wobble * 48271) % 2147483647;
    const moving = 0.75 + (wobble / 2147483647) * 0.5;
    wobble = (wobble * 48271) % 2147483647;
    return [moving, moving + (wobble / 2147483647 - 0.5) * 0.2];
  };
  const airport: Node[] = [];
  for (let i = 0; i < count; i++) {
    const [region, base] = regions[i % regions.length];
    const n = String(Math.floor(i / regions.length) + 1).padStart(2, '0');
    const tag = tags[Math.floor(rnd() * tags.length)];
    const alive = rnd() > 0.06 || !faults;
    const tcp = Math.round(base + rnd() * base * 0.8);
    const udp = alive ? tcp + Math.round(rnd() * 20) : null;
    const entry = node(
      region + ' ' + n + (tag ? ' ' + tag : ''),
      alive ? tcp : null,
      udp,
      rnd() > 0.5,
      'harbor',
      i === 0 ? 'hysteria2' : 'shadowsocks',
      drift()
    );
    if (entry.protocol === 'hysteria2') for (const sample of entry.health) if (sample.transport === 'tcp') sample.measurement = 'http_headers';
    if (i % 50 === 49) entry.health = [];
    airport.push(entry);
  }
  nodes.push(...airport);
  const groups: Group[] = [];
  activateInventory(configMain, '40', nodes, groups, structuredClone(providers), name => name);
  // A manual runtime choice differs by transport, independently of its configured default.
  for (const name of ['proxy', 'office']) {
    const selected = groups.find(group => group.name === name)!;
    selected.runtime.selection.tcp = {member_id: 'hk-01', resolved_leaf_node_id: 'hk-01', source: 'runtime'};
    selected.runtime.selection.udp = {member_id: 'hk-02', resolved_leaf_node_id: 'hk-02', source: 'runtime'};
  }
  for (const group of groups) {
    for (const network of ['tcp', 'udp'] as const) {
      const selection = group.runtime.selection[network];
      if (selection) selection.resolved_leaf_node_id = resolveLeaf(selection.member_id, network, nodes, groups)?.id ?? null;
    }
  }
  return {nodes, groups};
}
export const providers: Provider[] = [
  {
    id: 'harbor',
    name: 'harbor',
    kind: 'subscription',
    url_redacted: 'https://sub.example.net/api/v1/client/subscribe?token=<redacted>',
    node_count: 120,
    updated_at: ago(1800),
    expires_at: new Date(now + 23 * 86400 * 1000).toISOString(),
    traffic: {upload_bytes: '48318382080', download_bytes: '412316860416', total_bytes: '1099511627776'},
    status: 'ok',
    last_error: null,
    download: {route: 'routing', group_id: null}
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
// The faults scenario's subscription fetch failure, as a provider's last_error and its refresh operation's error.
export const providerFault = {code: 'fetch_failed', message: 'Subscription host answered HTTP 502', details: null};
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
  // This morning's automatic check found the files unchanged.
  last_checked_at: ago(5 * 3600),
  last_updated_at: ago(3 * 86400),
  next_check_at: null,
  last_error: null,
  required_codes: {geosite: [], geoip: []}
};
export const geodataFault: Pick<GeoData, 'last_checked_at' | 'last_error'> = {
  last_checked_at: ago(6 * 3600),
  last_error: {code: 'download_failed', message: 'Every geosite URL failed to download', details: null}
};
