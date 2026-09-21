import type {Datapath, Runtime, RuntimeMemory, RuntimeOutbounds, TrafficHistory, Version} from '../../model';
import {ago, observedAt, instanceId} from './clock';
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
  // The same degraded datapath /datapath reports in full: one delayed map sample, everything else attached.
  datapath: {
    kind: 'ebpf',
    state: 'degraded',
    visibility: 'full',
    ebpf: {
      backend: 'real',
      programs: 'loaded',
      hooks: 'attached',
      routing: {state: 'published', generation_id: '40'},
      health: 'degraded',
      last_error: 'Routing map sample delayed',
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
