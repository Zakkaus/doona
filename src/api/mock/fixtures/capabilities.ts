import type {Capabilities} from '../../model';
import {observedAt} from './clock';
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
    nodes: {available: true, can_manage: true},
    providers: {available: true, can_refresh: true, can_manage: true, max_page_size: 1000},
    geodata: {available: true, can_update: true, assets: ['geosite', 'geoip']},
    rules: {available: true, max_rules: 4096},
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
        max_members_per_job: 64,
        max_results_per_job: 256,
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
    logs: {available: false},
    dns_log: {available: false},
    runtime_settings: {available: false},
    geodata: {available: false},
    rules: {available: false},
    nodes: {available: true, can_manage: false},
    providers: {available: true, can_refresh: true, can_manage: false, max_page_size: 1000},
    config: {available: false, content: false},
    config_validate: {available: false},
    flows: {...capabilities.resources.flows, available: false},
    routing_trace: {...capabilities.resources.routing_trace, available: false},
    events: {...capabilities.resources.events, available: false}
  }
};

// The M1 profile exposes runtime and userspace-observed connections only, without close support.
export const capabilitiesM1: Capabilities = {
  ...capabilities,
  profiles: ['base'],
  resources: {
    ...Object.fromEntries(Object.keys(capabilities.resources).map(key => [key, {available: false}])),
    runtime: {available: true},
    connections: {available: true, can_close: false, max_bulk_close: 1000},
    config: {available: false, content: false}
  } as Capabilities['resources']
};
