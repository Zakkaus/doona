import type {Datapath, Runtime, RuntimeMemory, RuntimeOutbounds, TrafficHistory, Version} from '../../model';
import {ago, observedAt, instanceId, generationId} from './clock';
import {connections} from './network';
const live = [...connections.tcp, ...connections.udp].filter(connection => connection.state === 'active');
const current = {
  up: live.reduce((sum, row) => sum + Number(row.upload_bytes_per_second), 0),
  down: live.reduce((sum, row) => sum + Number(row.download_bytes_per_second), 0)
};
export function trafficSample(age: number): TrafficHistory['samples'][number] {
  const swell = 1 + 0.24 * Math.sin(age / 7200) + 0.19 * (Math.cos(age / 3100) - 1);
  const day = 1 + 0.3 * Math.sin((age / 86400) * Math.PI * 2);
  const burst = age > 23000 && age < 31000 ? 0.55 * Math.sin(((age - 23000) / 8000) * Math.PI) : 0;
  return {
    sampled_at: ago(age),
    upload_bytes_per_second: String(Math.max(0, Math.round(current.up * (swell * day + burst * 0.6)))),
    download_bytes_per_second: String(Math.max(0, Math.round(current.down * (swell * day + burst)))),
    connections: Math.max(2, Math.round(live.length + 8 * Math.sin(age / 9000) + 5 * (Math.cos(age / 3600) - 1) + burst * 12))
  };
}
// The recorder's last hour `elapsed` seconds after page load, a multiple of its ten-second step: the ring advances
// the way a backend's does, and a refetch returns the samples it already had.
export function trafficHistoryAt(elapsed: number): TrafficHistory {
  return {
    observed_at: ago(-elapsed),
    window_seconds: 3600,
    sampled_every_seconds: 10,
    samples: Array.from({length: 361}, (_, i) => trafficSample(3600 - i * 10 - elapsed))
  };
}
export const trafficHistory = trafficHistoryAt(0);
const counterSamples = Array.from({length: 1008}, (_, i) => trafficSample(604800 - i * 600));
const historyBytes = (field: 'upload_bytes_per_second' | 'download_bytes_per_second') =>
  counterSamples.reduce((sum, sample) => sum + BigInt(sample[field]!) * 600n, 0n);
const downloadTotal = historyBytes('download_bytes_per_second'),
  uploadTotal = historyBytes('upload_bytes_per_second');
const averageConnectionSeconds = 420;
const historyConnections = Math.round(counterSamples.reduce((sum, sample) => sum + sample.connections! * 600, 0) / averageConnectionSeconds);
const outboundShares = (['direct', 'proxy', 'resilient', 'gaming', 'block'] as const).map(name => ({
  name,
  kind: name === 'direct' || name === 'block' ? ('builtin' as const) : ('group' as const),
  active: live.filter(row => row.outbound === name).length,
  weight: live.filter(row => row.outbound === name).reduce((sum, row) => sum + BigInt(row.download_bytes ?? '0') + BigInt(row.upload_bytes ?? '0'), 0n)
}));
const allWeight = outboundShares.reduce((sum, row) => sum + row.weight, 0n);
const allocated = {up: 0n, down: 0n, connections: 0};
export const runtimeOutbounds: RuntimeOutbounds = {
  observed_at: observedAt,
  counter_since: ago(604800),
  outbounds: outboundShares.map((row, index) => {
    const last = index === outboundShares.length - 2;
    const up = last ? uploadTotal - allocated.up : (uploadTotal * row.weight) / allWeight;
    const down = last ? downloadTotal - allocated.down : (downloadTotal * row.weight) / allWeight;
    const total = last ? historyConnections - allocated.connections : Math.floor((historyConnections * Number(row.weight)) / Number(allWeight));
    allocated.up += up;
    allocated.down += down;
    allocated.connections += total;
    return {
      name: row.name,
      kind: row.kind,
      active_connections: row.active,
      total_connections: String(total),
      upload_bytes: String(up),
      download_bytes: String(down),
      errors: '0'
    };
  })
};
// honk's latest upstream release as its /version reports it: the tag name and the tagged commit.
export const version: Version = {
  api: {name: 'dae/honk-native', major: 1, status: 'draft'},
  engine: {name: 'honk', version: 'v0.0.1.beta.81'},
  build: {revision: '697ac9ea5e82bc120ed942943fe0cafbdd7bf423', target: null, built_at: null}
};
export const runtime: Runtime = {
  observed_at: observedAt,
  instance_id: instanceId,
  lifecycle: {state: 'running', started_at: ago(777600), uptime_seconds: '777600'},
  generation: {active_id: generationId, config_revision: generationId, state: 'active', activated_at: ago(210)},
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
    connections: {
      tcp: live.filter(row => connections.tcp.includes(row)).length,
      udp: live.filter(row => connections.udp.includes(row)).length,
      total: live.length
    },
    bytes: {upload: String(uploadTotal), download: String(downloadTotal)},
    rates: {window_seconds: 10, upload_bytes_per_second: String(current.up), download_bytes_per_second: String(current.down)}
  },
  process: {pid: 1842, cpu_percent: 2.1},
  last_reload: {operation_id: 'op-1182', status: 'succeeded', finished_at: ago(170), error: null}
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
    maps: {state: 'ready', conn_state: {occupancy: live.length, capacity: 65536, occupancy_known: true}}
  },
  errors: [{code: 'sample_delayed', message: 'Routing map sample delayed'}]
};
export const runtimeMemory: RuntimeMemory = {
  observed_at: observedAt,
  process: {rss_bytes: '48234496'},
  cgroup: {scope: 'service', current_bytes: '67108864', limit_bytes: '268435456', events: {high: '2', oom: '0', oom_kill: '0'}},
  kernel: {ebpf_bytes: '18874368', sampled_at: observedAt}
};
