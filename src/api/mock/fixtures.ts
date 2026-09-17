import type {
  Capabilities,
  Connection,
  ConnectionList,
  Datapath,
  DnsCacheList,
  FlowDetail,
  Group,
  HealthObservation,
  Node,
  Runtime,
  RuntimeMemory,
  RuntimeOutbounds,
  RuntimeSettings,
  ConfigSource,
  ConfigDiagnostic,
  Provider,
  GeoData,
  LogRecord,
  TrafficHistory,
  Version
} from '../model';
import {createFlow, flowFields, type ConnectionSeed} from './flows';

// Fixture clocks are anchored to page load so ages and expiries read naturally instead of drifting from a fixed date.
const now = Date.now();
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
const ahead = (seconds: number) => new Date(now + seconds * 1000).toISOString();
export const observedAt = ago(0);
export const instanceId = 'mock-instance-1';
const history = {
  connSeries: Array.from({length: 73}, (_, i) =>
    Math.max(2, Math.round(7 + 2.5 * Math.sin((i - 72) / 9) + (i > 40 && i < 52 ? 4 * Math.sin(((i - 40) / 12) * Math.PI) : 0)))
  ),
  throughput: Array.from({length: 73}, (_, i) => {
    const x = i / 72;
    const burst = i > 40 && i < 52 ? 1 : 0;
    const down = 1400 + 2400 * Math.abs(Math.sin(x * 6.8 + 0.4)) + 6000 * burst * Math.sin(((i - 40) / 12) * Math.PI) + 60 * Math.sin(i * 0.9);
    const up = 140 + 220 * Math.abs(Math.cos(x * 5.3)) + 900 * burst * Math.sin(((i - 40) / 12) * Math.PI) + 8 * Math.sin(i * 1.1);
    return {t: i * 10, up: Math.max(0, Math.round(up)), down: Math.max(0, Math.round(down))};
  })
};
const latest = history.throughput[history.throughput.length - 1];
export const trafficHistory: TrafficHistory = {
  observed_at: observedAt,
  window_seconds: 3600,
  sampled_every_seconds: 10,
  samples: history.throughput.map((s, i) => ({
    sampled_at: ago(720 - s.t),
    upload_bytes_per_second: String(BigInt(s.up) * 1000n),
    download_bytes_per_second: String(BigInt(s.down) * 1000n),
    connections: history.connSeries[i]
  }))
};
const historyBytes = (field: 'up' | 'down') => history.throughput.reduce((sum, sample) => sum + BigInt(sample[field]) * 10000n, 0n);
const downloadTotal = historyBytes('down'),
  uploadTotal = historyBytes('up');
const historyConnections = history.connSeries.reduce((sum, n) => sum + n, 0);
const outboundShares = [
  {name: 'direct', kind: 'builtin', share: 78, active: 2},
  {name: 'proxy', kind: 'group', share: 20, active: 3},
  {name: 'resilient', kind: 'group', share: 1, active: 1},
  {name: 'gaming', kind: 'group', share: 1, active: 1},
  {name: 'block', kind: 'builtin', share: 0, active: 0}
] as const;
export const runtimeOutbounds: RuntimeOutbounds = {
  observed_at: observedAt,
  counter_since: ago(730),
  outbounds: outboundShares.map(row => ({
    name: row.name,
    kind: row.kind,
    active_connections: row.active,
    total_connections: String(Math.floor((historyConnections * row.share) / 100)),
    upload_bytes: String((uploadTotal * BigInt(row.share)) / 100n),
    download_bytes: String((downloadTotal * BigInt(row.share)) / 100n),
    errors: '0'
  }))
};
export const version: Version = {
  api: {name: 'dae/honk-native', major: 1, status: 'draft'},
  engine: {name: 'honk', version: '0.9.3'},
  build: {revision: 'd6ccc15f', target: null, built_at: null}
};
export const runtime: Runtime = {
  observed_at: observedAt,
  instance_id: instanceId,
  lifecycle: {state: 'running', started_at: ago(273600), uptime_seconds: '273600'},
  generation: {active_id: '40', config_revision: '40', state: 'active', activated_at: observedAt},
  datapath: {
    kind: 'ebpf',
    state: 'active',
    visibility: 'full',
    ebpf: {
      backend: 'real',
      programs: 'loaded',
      hooks: 'attached',
      routing: {state: 'published', generation_id: '40'},
      health: 'healthy',
      last_error: null,
      checked_at: observedAt
    }
  },
  traffic: {
    scope: 'visible',
    observed_by: 'mixed',
    counter_since: runtimeOutbounds.counter_since,
    sampled_at: observedAt,
    connections: {tcp: 5, udp: 2, total: 7},
    bytes: {upload: String(uploadTotal), download: String(downloadTotal)},
    rates: {window_seconds: 10, upload_bytes_per_second: String(BigInt(latest.up) * 1000n), download_bytes_per_second: String(BigInt(latest.down) * 1000n)}
  },
  process: {pid: 1842, cpu_percent: 2.1},
  last_reload: {operation_id: 'op-1182', status: 'succeeded', finished_at: observedAt, error: null}
};
export const datapath: Datapath = {
  observed_at: observedAt,
  kind: 'ebpf',
  state: 'degraded',
  visibility: 'full',
  ebpf: {
    ...runtime.datapath.ebpf!,
    health: 'degraded',
    last_error: 'Routing map sample delayed',
    attachments: ['lan0', 'wan0'].flatMap(iface =>
      (['ingress', 'egress'] as const).map(direction => ({name: 'honk_' + direction, interface: iface, direction, state: 'attached' as const}))
    ),
    maps: {state: 'ready', conn_state: {occupancy: 8, capacity: 65536, occupancy_known: true}}
  },
  errors: [{code: 'sample_delayed', message: 'Routing map sample delayed'}]
};
export const runtimeMemory: RuntimeMemory = {
  observed_at: observedAt,
  process: {rss_bytes: '48234496'},
  cgroup: {scope: 'service', current_bytes: '67108864', limit_bytes: '268435456', events: {high: '2', oom: '0', oom_kill: '0'}},
  kernel: {ebpf_bytes: '18874368', sampled_at: observedAt}
};
export const capabilities: Capabilities = {
  observed_at: observedAt,
  profiles: ['base', 'full_transparency'],
  limits: {max_request_target_bytes: 4096, max_header_bytes: 16384, max_json_body_bytes: 65536},
  resources: {
    runtime: {available: true},
    runtime_memory: {
      available: true,
      metrics: [
        'process.rss_bytes',
        'cgroup.current_bytes',
        'cgroup.limit_bytes',
        'cgroup.events.high',
        'cgroup.events.oom',
        'cgroup.events.oom_kill',
        'kernel.ebpf_bytes'
      ]
    },
    datapath: {available: true, kinds: ['ebpf'], details: ['attachments', 'maps']},
    runtime_outbounds: {available: true},
    traffic_history: {available: true, max_window_seconds: 3600, max_points: 360},
    memory_history: {available: true, max_window_seconds: 3600, max_points: 720},
    runtime_mode: {available: true, modes: ['rule', 'direct', 'global']},
    nodes: {available: true, can_manage: true},
    providers: {available: true, can_refresh: true, can_manage: true, max_page_size: 1000},
    geodata: {available: true, can_update: true, assets: ['geosite', 'geoip']},
    rules: {available: false},
    config: {available: true, content: true, writable: true, max_bytes: 1048576, max_sources: 32},
    config_validate: {available: true, modes: ['syntax', 'full'], max_bytes: 1048576, max_sources: 32},
    logs: {available: true, levels: ['trace', 'debug', 'info', 'warn', 'error'], max_buffered_records: 4096},
    dns_log: {available: true, max_records: 2048, max_page_size: 500},
    runtime_settings: {available: true, fields: ['log.level', 'log.buffered_records', 'dns_log.max_records', 'flows.max_flows', 'flows.retention_seconds']},
    groups: {available: true, config_patch: true, selection: true, max_patch_operations: 32},
    probes: {
      available: true,
      targets: ['node', 'group'],
      kinds: ['tcp_connect', 'http', 'dns'],
      purposes: ['data', 'dns'],
      transports: ['tcp', 'udp'],
      ip_versions: ['ipv4', 'ipv6'],
      limits: {
        max_members_per_job: 1000,
        max_results_per_job: 4000,
        max_active_jobs: 4,
        max_queued_jobs: 16,
        max_concurrent_per_target: 1,
        job_timeout_ms: 30000,
        per_principal_requests_per_minute: 60,
        global_requests_per_minute: 120
      }
    },
    connections: {available: true, can_close: true, max_bulk_close: 200},
    flows: {
      available: true,
      recording: 'on',
      scopes: ['userspace_tcp', 'userspace_udp', 'kernel_direct', 'kernel_block', 'dns_intercept', 'kernel_bypass'],
      max_flows: 4096,
      max_steps_per_flow: 64,
      retention_seconds: 300,
      snapshot_ttl_seconds: 60,
      max_page_size: 1000
    },
    routing_trace: {
      available: true,
      resolve_modes: ['none', 'live'],
      max_addresses: 16,
      max_rule_steps: 128,
      timeout_ms: 5000,
      per_principal_requests_per_minute: 60,
      global_requests_per_minute: 120
    },
    events: {
      available: true,
      kinds: ['stream.ready', 'runtime.updated', 'flow.updated', 'flow.gap', 'operation.updated', 'generation.changed'],
      retention_seconds: 300,
      max_buffered_events: 1024,
      max_clients: 16,
      heartbeat_seconds: 15
    },
    dns_query: {
      available: true,
      record_types: ['A', 'AAAA', 'HTTPS'],
      limits: {
        max_types_per_request: 8,
        query_timeout_ms: 5000,
        max_response_bytes: 65536,
        per_principal_requests_per_minute: 60,
        global_requests_per_minute: 120
      }
    },
    dns_cache: {available: true, read: true, delete_entry: true, delete_name: true, flush: true, entry_kinds: ['positive', 'negative']},
    operations: {available: true, retention_seconds: 300},
    reload: {available: true},
    suspend: {available: true},
    resume: {available: true}
  }
};
export const capabilitiesBase: Capabilities = {
  ...capabilities,
  profiles: ['base'],
  resources: {
    ...capabilities.resources,
    runtime_outbounds: {available: false},
    traffic_history: {available: false},
    memory_history: {available: false},
    runtime_mode: {available: false},
    logs: {available: false},
    dns_log: {available: false},
    runtime_settings: {available: false},
    geodata: {available: false},
    nodes: {available: true, can_manage: false},
    providers: {available: true, can_refresh: true, can_manage: false, max_page_size: 1000},
    config: {available: false, content: false},
    config_validate: {available: false},
    flows: {...capabilities.resources.flows, available: false},
    routing_trace: {...capabilities.resources.routing_trace, available: false},
    events: {...capabilities.resources.events, available: false}
  }
};

// What PATCH /runtime/settings can change; the values start from the configuration and the ceilings are the
// capabilities above.
export const runtimeSettings: RuntimeSettings = {
  observed_at: observedAt,
  source: 'config',
  log: {level: 'info', buffered_records: 1024},
  dns_log: {max_records: 2048},
  flows: {max_flows: 4096, retention_seconds: 300}
};

// The demo routing dictionary the mock evaluates in routing.ts; the native API exposes no rule list yet.
// The routing rules the demo's trace and flow evidence refer to, in config order.
type ConfigRule = {id: string; cond: string; target: string; must: boolean};
export type MockConfigRules = {generation_id: string; rules: ConfigRule[]; fallback: {target: string; source: string}};
export const rules: ConfigRule[] = [
  {id: 'r1', cond: 'domain(suffix: doubleclick.net)', target: 'block', must: false},
  {id: 'r2', cond: 'pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53)', target: 'direct', must: true},
  {id: 'r3', cond: 'dip(geoip: private)', target: 'direct', must: true},
  {id: 'r4', cond: 'domain(geosite: cn)', target: 'direct', must: false},
  {id: 'r5', cond: 'domain(geosite: telegram)', target: 'proxy', must: false},
  {id: 'r6', cond: 'mac(aa:bb:cc:dd:ee:ff) && ipversion(4)', target: 'direct', must: false},
  {id: 'r7', cond: 'domain(geosite: discord)', target: 'proxy', must: false},
  {id: 'r8', cond: 'sip(10.0.0.0/24) && dport(25)', target: 'block', must: false}
];
export const configRules: MockConfigRules = {generation_id: runtime.generation.active_id!, rules, fallback: {target: 'resilient', source: 'config.dae:44'}};

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
    moving_avg_ms: latency,
    avg10_ms: latency,
    observed_at: observedAt,
    error: latency === null ? 'timeout' : null
  };
}
function node(name: string, tcp: number | null, udp: number | null, v6: boolean, source: string): Node {
  return {
    id: name,
    name,
    protocol: 'shadowsocks',
    subscription_tag: source,
    provider_id: source === 'inline' ? 'inline' : source,
    group_ids: [],
    health: [health('udp', udp), health('tcp', tcp), ...(v6 ? [health('tcp', tcp, 'ipv6')] : [])]
  };
}
// What an automatic policy would pick on its own: the healthy member with the lowest latency, else the first.
export function policyPick(group: Group): string {
  const ranked = group.runtime.health
    .filter(h => h.state === 'healthy' && h.transport === 'tcp' && h.latency_ms != null)
    .sort((a, b) => a.latency_ms! - b.latency_ms!);
  return ranked[0]?.member_id ?? group.members[0].id;
}
function group(name: string, kind: Group['policy']['kind'], members: string[], leaf: string, nodes: Node[]): Group {
  for (const n of nodes) if (members.includes(n.id)) n.group_ids.push(name);
  const selection = {member_id: leaf, resolved_leaf_node_id: leaf, source: kind === 'selector' ? 'runtime' : 'policy'};
  return {
    id: name,
    name,
    icon: null,
    config_revision: '40',
    policy: {kind, native: kind},
    members: members.map(id => ({id, name: id, kind: nodes.some(n => n.id === id) ? 'node' : 'group'})),
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
        udp: name === 'proxy' && members.includes('hk-02') ? {...selection, member_id: 'hk-02', resolved_leaf_node_id: 'hk-02'} : {...selection}
      },
      health: nodes
        .filter(n => members.includes(n.id))
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
    node('hk-01', 84, 91, true, 'inline'),
    node('hk-02', 91, 88, true, 'inline'),
    node('sg-01', 63, 70, false, 'inline'),
    node('jp-01', null, null, false, 'inline'),
    node('us-01', 188, 201, true, 'inline')
  ];
  const groups = [
    group('proxy', 'selector', ['hk-01', 'hk-02', 'sg-01', 'jp-01', 'us-01', 'resilient'], 'hk-01', nodes),
    group('resilient', 'score', ['hk-01', 'sg-01', 'us-01'], 'sg-01', nodes),
    group('gaming', 'urltest', ['jp-01', 'hk-02'], 'hk-02', nodes)
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
    airport.push(node(region + ' ' + n + (tag ? ' · ' + tag : ''), alive ? tcp : null, udp, rnd() > 0.5, 'sub-c'));
  }
  if (airport.length) {
    nodes.push(...airport);
    groups.push(
      group(
        'skylink',
        'selector',
        airport.map(n => n.id),
        airport[0].id,
        nodes
      )
    );
  }
  return {nodes, groups};
}

const AGES: Record<string, number> = {'1': 252, '2': 723, '3': 18, '4': 5, '5': 1, '6': 580, '7': 61, '8': 3};
export const flows: FlowDetail[] = [];
function connection(
  id: string,
  dst: string,
  src: string,
  outbound: string,
  download: string,
  upload: string,
  domain: string | null = null,
  network: 'tcp' | 'udp' = 'tcp'
): Connection {
  const seed: ConnectionSeed = {
    id,
    flow_id: ['1', '2', '5'].includes(id) ? 'flow-' + id : null,
    pname: null,
    state: outbound === 'block' ? 'blocked' : 'active',
    src,
    dst,
    domain,
    outbound,
    started_at: ago(AGES[id] ?? 60),
    observed_by: outbound === 'direct' || outbound === 'block' ? 'ebpf' : 'userspace',
    upload_bytes: upload,
    download_bytes: download,
    upload_bytes_per_second: '0',
    download_bytes_per_second: '0'
  };
  const flow = createFlow(seed, network, observedAt, instanceId);
  flows.push(flow);
  return {...seed, ...flowFields(flow.input, flow.trace.steps)};
}
export const connections: ConnectionList = {
  observed_at: observedAt,
  instance_id: instanceId,
  visibility: 'full',
  truncated: false,
  total_tcp: 6,
  total_udp: 2,
  tcp: [
    connection('1', '149.154.167.220:443', '10.0.0.12', 'proxy', '1200000', '84000', 'api.telegram.org'),
    connection('2', '120.92.78.14:443', '10.0.0.7', 'direct', '1099998000', '1100000', 'cdn.bilibili.com'),
    connection('3', '52.84.19.3:443', '10.0.0.7', 'proxy', '307400000', '12000'),
    connection('4', '142.250.66.46:443', '10.0.0.31', 'block', '0', '0', 'doubleclick.net'),
    connection('6', '104.16.132.229:443', '10.0.0.31', 'proxy', '3400000', '210000', 'discord.com'),
    connection('7', '203.0.113.9:8443', '10.0.0.20', 'resilient', '96000', '40000')
  ],
  udp: [
    connection('5', '1.1.1.1:53', '10.0.0.12', 'direct', '2000', '2000', null, 'udp'),
    connection('8', '10.0.0.1:53', '10.0.0.20', 'gaming', '12000', '1000', null, 'udp')
  ]
};

export const flowDroppedRecords = '3';
export const flowSummaryOmitsInput: Record<string, true> = {'flow-unobserved': true};
const unobservedFlow: FlowDetail = {
  ...flows[0],
  id: 'flow-unobserved',
  connection_id: null,
  state: 'observed',
  outbound: null,
  chain: [],
  chain_source: 'unknown',
  rule_id: null,
  rule_expression: null,
  rule_source: 'unknown',
  trace_status: 'partial',
  trace: {status: 'partial', missing: ['not_instrumented'], steps: []}
};
flows.push(unobservedFlow, {
  ...unobservedFlow,
  id: 'flow-ipv6',
  input: {...unobservedFlow.input, src: '[2001:db8::12]:5000'}
});
// Retained terminal flows without a live connection: the routing view shows a config with many rules.
function retained(id: string, domain: string, outbound: string, network: 'tcp' | 'udp' = 'tcp') {
  const seed: ConnectionSeed = {
    id,
    flow_id: 'flow-' + id,
    pname: null,
    state: outbound === 'block' ? 'blocked' : 'closed',
    src: '10.0.0.' + (10 + (Number(id.replace(/\D/g, '')) % 40)) + ':' + (40000 + Number(id.replace(/\D/g, ''))),
    dst: '203.0.113.' + (Number(id.replace(/\D/g, '')) % 250) + ':443',
    domain,
    outbound,
    started_at: ago(600 + Number(id.replace(/\D/g, '')) * 7),
    observed_by: outbound === 'direct' || outbound === 'block' ? 'ebpf' : 'userspace',
    upload_bytes: '4096',
    download_bytes: '65536',
    upload_bytes_per_second: '0',
    download_bytes_per_second: '0'
  };
  flows.push(createFlow(seed, network, observedAt, instanceId));
}
for (const [id, domain, outbound] of [
  ['r01', 'www.netflix.com', 'proxy'],
  ['r02', 'rr1---sn-ab5l6n7z.googlevideo.com', 'proxy'],
  ['r03', 'www.google.com', 'proxy'],
  ['r04', 'raw.githubusercontent.com', 'proxy'],
  ['r05', 'gateway.icloud.com', 'direct'],
  ['r06', 'login.live.com', 'proxy'],
  ['r07', 'store.steampowered.com', 'proxy'],
  ['r08', 'api.spotify.com', 'proxy'],
  ['r09', 'pbs.twimg.com', 'proxy'],
  ['r10', 'scontent.cdninstagram.com', 'proxy'],
  ['r11', 'chatgpt.com', 'proxy'],
  ['r12', 'claude.ai', 'proxy'],
  ['r13', 'www.reddit.com', 'proxy'],
  ['r14', 'en.wikipedia.org', 'proxy'],
  ['r15', 'api.cloudflare.com', 'proxy'],
  ['r16', 'www.taobao.com', 'direct'],
  ['r17', 'weixin.qq.com', 'direct'],
  ['r18', 'www.zhihu.com', 'direct'],
  ['r19', 'www.douyin.com', 'direct'],
  ['r20', 'www.iqiyi.com', 'direct'],
  ['r21', 'www.jd.com', 'direct'],
  ['r22', 'www.xiaohongshu.com', 'direct'],
  ['r23', 'www.baidu.com', 'direct'],
  ['r24', 'steamcdn-a.akamaihd.net', 'proxy'],
  ['r25', 'www.speedtest.net', 'direct'],
  ['r26', 'ad.doubleclick.net', 'block'],
  ['r27', 'pagead2.googlesyndication.com', 'block'],
  ['r28', 'controlplane.tailscale.com', 'direct'],
  ['r29', 'www.youtube.com', 'proxy'],
  ['r30', 'graph.facebook.com', 'proxy']
] as const)
  retained(id, domain, outbound);

export function connectionFixtures() {
  const templates = [
    ...connections.tcp.map(connection => ({connection, network: 'tcp' as const})),
    ...connections.udp.map(connection => ({connection, network: 'udp' as const}))
  ].sort((a, b) => Number(a.connection.id) - Number(b.connection.id));
  const snapshot: ConnectionList = {...connections, tcp: [], udp: [], total_tcp: 0, total_udp: 0};
  const recorded: FlowDetail[] = [];
  for (let i = 0; i < 1200; i++) {
    const {connection, network} = templates[i % templates.length];
    const suffix = String(i + 1).padStart(4, '0');
    const row: Connection = {
      ...connection,
      id: 'c-' + suffix,
      started_at: ago((i * 3600) / 1200),
      flow_id: (i + 1) % 3 === 0 ? 'flow-c-' + suffix : null
    };
    snapshot[network].push(row);
    if (row.flow_id) {
      const flow = createFlow(row, network, observedAt, instanceId);
      recorded.push({...flow, id: row.flow_id, connection_id: row.id});
    }
  }
  snapshot.total_tcp = snapshot.tcp.length;
  snapshot.total_udp = snapshot.udp.length;
  return {connections: snapshot, flows: recorded};
}
export const dnsCache: DnsCacheList = {
  observed_at: observedAt,
  coverage: {positive: true, negative: true, persistent: false},
  total: 5,
  next_cursor: null,
  entries: [
    {
      entry_id: 'c1',
      domain: 'api.telegram.org.',
      type: 'A',
      class: 'IN',
      status: 'NOERROR',
      answers: [{name: 'api.telegram.org.', type: 'A', class: 'IN', ttl: 240, data: '149.154.167.220'}],
      expires_at: ahead(240),
      stale_until: null
    },
    {
      entry_id: 'c2',
      domain: 'cdn.bilibili.com.',
      type: 'A',
      class: 'IN',
      status: 'NOERROR',
      answers: [{name: 'cdn.bilibili.com.', type: 'A', class: 'IN', ttl: 60, data: '120.92.78.14'}],
      expires_at: ahead(60),
      stale_until: ahead(120)
    },
    {entry_id: 'c3', domain: 'cdn.bilibili.com.', type: 'AAAA', class: 'IN', status: 'NXDOMAIN', expires_at: ahead(60), stale_until: null},
    {
      entry_id: 'c4',
      domain: 'doubleclick.net.',
      type: 'A',
      class: 'IN',
      status: 'NOERROR',
      answers: [{name: 'doubleclick.net.', type: 'A', class: 'IN', ttl: 3600, data: '0.0.0.0'}],
      expires_at: ahead(3600),
      stale_until: null
    },
    {entry_id: 'c5', domain: 'discord.com.', type: 'HTTPS', class: 'IN', status: 'NXDOMAIN', expires_at: ahead(540), stale_until: null}
  ]
};

// The accepted configuration the mock serves: dae text that names the same groups and rules the rest of the
// mock uses. Hashes are computed by the mock on first read; an edit replaces the text and bumps the generation.
const configMain = `global {
  tproxy_port: 12345
  log_level: info
  lan_interface: br-lan
  wan_interface: auto
  allow_insecure: false
  auto_config_kernel_parameter: true
}

subscription {
  sub-c: 'https://sub.example.net/api/v1/client/subscribe?token=demo'
}

node {
  'hk-01': 'vless://demo@hk-01.example.net:443?security=tls#hk-01'
  'hk-02': 'vless://demo@hk-02.example.net:443?security=tls#hk-02'
  'sg-01': 'trojan://demo@sg-01.example.net:443#sg-01'
  'jp-01': 'vless://demo@jp-01.example.net:443?security=tls#jp-01'
  'us-01': 'trojan://demo@us-01.example.net:443#us-01'
}

group {
  proxy { policy: fixed(0) }
  resilient { filter: name(hk-01, sg-01, us-01) policy: min_avg10 }
  gaming { filter: name(jp-01, hk-02) policy: min_last_delay }
  skylink { filter: subtag(sub-c) policy: min_moving_avg }
}

dns {
  upstream {
    cloudflare: 'tls://1.1.1.1:853'
    alidns: 'udp://223.5.5.5:53'
  }
  routing {
    request { qname(geosite: cn) -> alidns; fallback: cloudflare }
  }
}

routing {
  domain(suffix: doubleclick.net) -> block
  pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53) -> direct(must)
  dip(geoip: private) -> direct(must)
  domain(geosite: cn) -> direct
  domain(geosite: telegram) -> proxy
  include rules.dae
  fallback: resilient
}
`;
const configRulesFile = `# Household exceptions, kept apart from config.dae.
# The TV never leaves through a node.
mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct

# Chat
domain(geosite: discord) -> proxy
sip(10.0.0.0/24) && dport(25) -> block
`;
const configSubscription = `'香港 01 · IPLC': 'vless://<redacted>'
'香港 02 · BGP': 'vless://<redacted>'
'新加坡 01 · 2x': 'trojan://<redacted>'
'日本 01 · 2x': 'vless://<redacted>'
`;
const configGenerated = `# Written by honk from the subscription; edits are lost on refresh.
skylink { filter: subtag(sub-c) }
`;
// Diagnostics the engine kept when it accepted the configuration: nothing fatal, the kind of thing a person
// wants to know about before the next reload.
export const configNotes: ConfigDiagnostic[] = [
  {
    level: 'warning',
    source_id: 'src-main',
    line: 5,
    column: 3,
    span: null,
    code: 'interface_auto',
    message: 'wan_interface: auto is resolved at start; a changed default route needs a reload'
  },
  {
    level: 'warning',
    source_id: 'src-rules',
    line: 3,
    column: 1,
    span: null,
    code: 'mac_unseen',
    message: 'mac(aa:bb:cc:dd:ee:ff) has not been seen on the LAN since start'
  },
  {
    level: 'info',
    source_id: 'src-sub-c',
    line: 1,
    column: null,
    span: null,
    code: 'subscription_cached',
    message: 'Subscription fetched 30 minutes ago; nodes come from the cache'
  }
];
// Where nodes come from: the subscription the config names, and the nodes written by hand in config.dae.
export const providers: Provider[] = [
  {
    id: 'sub-c',
    name: 'sub-c',
    kind: 'subscription',
    url_redacted: 'https://sub.example.net/api/v1/client/subscribe?token=<redacted>',
    node_count: 100,
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
export const linkSchemes = ['vless', 'vmess', 'trojan', 'trojan-go', 'ss', 'ssr', 'socks5', 'http', 'https', 'hysteria2', 'hy2', 'tuic', 'juicity'];
// The geosite and geoip files the demo datapath was built from.
export const geodata: GeoData = {
  observed_at: observedAt,
  assets: [
    {
      kind: 'geosite',
      sha256: '3f5a9c1e7b2d4c6a8e0f1b3d5a7c9e1f3b5d7a9c1e3f5a7b9d1c3e5f7a9b1d3c',
      size_bytes: '4718592',
      modified_at: ago(3 * 86400),
      source_redacted: 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat'
    },
    {
      kind: 'geoip',
      sha256: '9b1d3c5e7f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e',
      size_bytes: '6291456',
      modified_at: ago(3 * 86400),
      source_redacted: 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat'
    }
  ]
};
// What the engine logged while starting: the replay ring's first records.
export const logSeed: Array<Pick<LogRecord, 'level' | 'target' | 'message'> & {fields?: LogRecord['fields']}> = [
  {level: 'info', target: 'honk::main', message: 'honk 0.9.3 starting.', fields: {pid: 4120}},
  {level: 'info', target: 'honk::config', message: 'Configuration accepted.', fields: {sources: 4, generation_id: '40'}},
  {level: 'info', target: 'honk::subscription', message: 'Subscription loaded.', fields: {provider: 'sub-c', nodes: 100}},
  {level: 'warn', target: 'honk::subscription', message: 'Subscription served from cache.', fields: {provider: 'sub-c', age_seconds: 1800}},
  {level: 'info', target: 'honk::datapath', message: 'Kernel datapath attached.', fields: {interface: 'br-lan'}},
  {level: 'info', target: 'honk::dns', message: 'DNS listener bound.', fields: {bind: '127.0.0.1:5353'}},
  {level: 'info', target: 'honk::routing', message: 'Routing generation published.', fields: {generation_id: '40'}},
  {level: 'error', target: 'honk::group', message: 'Health check failed.', fields: {node: 'jp-01', error: 'connect timeout'}},
  {level: 'info', target: 'honk::api', message: 'Native API listening.', fields: {listen: '127.0.0.1:9090'}}
];
// The demo's sources. The main config carries placeholder credentials in the clear, so it hashes to its own
// digest and can be edited; the fetched subscription is served redacted, with the digest of the text on disk,
// which is how a real backend hands out a file it will not let a client write back.
export const configSources: Array<Omit<ConfigSource, 'content_sha256' | 'bytes' | 'line_count'> & {content: string; onDisk?: string}> = [
  {id: 'src-main', path: '/etc/honk/config.dae', kind: 'main', writable: true, loaded_at: ago(3600), content: configMain},
  {id: 'src-rules', path: '/etc/honk/rules.dae', kind: 'include', writable: true, loaded_at: ago(3600), content: configRulesFile},
  {
    id: 'src-sub-c',
    path: '/var/lib/honk/subscriptions/sub-c.dae',
    kind: 'subscription',
    writable: false,
    loaded_at: ago(1800),
    content: configSubscription,
    onDisk: configSubscription.replaceAll('<redacted>', 'demo@edge.example.net:443')
  },
  {id: 'src-generated', path: '/var/lib/honk/generated/skylink.dae', kind: 'generated', writable: false, loaded_at: ago(1800), content: configGenerated}
];
