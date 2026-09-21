import type {Api} from '../api';
import type {Capabilities} from '../model';
import {ApiError} from '../error';
import * as fixtures from './fixtures/runtime';

type RuntimeApi = Pick<
  Api,
  'discovery' | 'version' | 'capabilities' | 'runtime' | 'runtimeOutbounds' | 'trafficHistory' | 'memoryHistory' | 'datapath' | 'runtimeMemory'
>;
export function createRuntime(capabilities: Capabilities, big: boolean) {
  const runtime = structuredClone(fixtures.runtime);
  const outbounds = structuredClone(fixtures.runtimeOutbounds);
  // A large deployment lists dozens of outbounds, most of them idle.
  if (big)
    outbounds.outbounds.push(
      ...Array.from({length: 24}, (_, i) => ({
        name: `kad.${['hk', 'jp', 'us'][i % 3]}.${String(i + 1).padStart(2, '0')}`,
        kind: 'group' as const,
        active_connections: 0,
        total_connections: '1',
        upload_bytes: '0',
        download_bytes: String(Math.max(0, 900_000 - i * 60_000)),
        errors: '0'
      }))
    );
  const api: RuntimeApi = {
    discovery: async signal => {
      signal?.throwIfAborted();
      return {
        name: 'dae/honk-native',
        status: 'draft',
        api_major: 1,
        base_path: '/api/v1',
        links: {
          version: '/api/v1/version',
          capabilities: '/api/v1/capabilities',
          runtime: '/api/v1/runtime',
          runtime_outbounds: '/api/v1/runtime/outbounds',
          config: '/api/v1/config',
          config_validate: '/api/v1/config/validate',
          traffic_history: '/api/v1/runtime/traffic/history',
          memory_history: '/api/v1/runtime/memory/history',
          logs: '/api/v1/logs',
          providers: '/api/v1/providers',
          geodata: '/api/v1/geodata',
          rules: '/api/v1/rules',
          operations: '/api/v1/operations/{id}'
        }
      };
    },
    version: async signal => {
      signal?.throwIfAborted();
      return structuredClone(fixtures.version);
    },
    capabilities: async signal => {
      signal?.throwIfAborted();
      return structuredClone(capabilities);
    },
    runtime: async signal => {
      signal?.throwIfAborted();
      const now = Date.now();
      if (runtime.lifecycle.started_at)
        runtime.lifecycle.uptime_seconds = String(Math.max(0, Math.floor((now - Date.parse(runtime.lifecycle.started_at)) / 1000)));
      const snapshot = structuredClone(runtime);
      // Each poll is a fresh sample with a little swell, so the live curve keeps moving.
      const swell = 1 + 0.15 * Math.sin(now / 20000);
      snapshot.traffic.sampled_at = new Date(now).toISOString();
      if (snapshot.traffic.rates) {
        snapshot.traffic.rates.upload_bytes_per_second = String(Math.round(Number(runtime.traffic.rates!.upload_bytes_per_second) * swell));
        snapshot.traffic.rates.download_bytes_per_second = String(Math.round(Number(runtime.traffic.rates!.download_bytes_per_second) * swell));
      }
      return snapshot;
    },
    runtimeOutbounds: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.runtime_outbounds.available) throw new ApiError(404, 'capability_not_supported', 'Outbound counters unavailable');
      return structuredClone(outbounds);
    },
    trafficHistory: async (query, signal) => {
      signal?.throwIfAborted();
      const limits = capabilities.resources.traffic_history;
      if (!limits.available) throw new ApiError(404, 'capability_not_supported', 'Traffic history unavailable');
      const window_seconds = query?.window_seconds ?? limits.max_window_seconds!;
      const max_points = query?.max_points ?? limits.max_points!;
      if (
        !Number.isSafeInteger(window_seconds) ||
        window_seconds < 1 ||
        window_seconds > limits.max_window_seconds! ||
        !Number.isSafeInteger(max_points) ||
        max_points < 1 ||
        max_points > limits.max_points!
      )
        throw new ApiError(400, 'invalid_request', 'History query exceeds the advertised limits');
      const history = fixtures.trafficHistory;
      const samples = history.samples.filter(s => Date.parse(s.sampled_at) > Date.parse(history.observed_at) - window_seconds * 1000);
      const stride = Math.max(1, Math.ceil(samples.length / max_points));
      return {
        ...history,
        window_seconds,
        sampled_every_seconds: history.sampled_every_seconds * stride,
        samples: structuredClone(samples.filter((_, i) => (samples.length - 1 - i) % stride === 0))
      };
    },
    memoryHistory: async (query, signal) => {
      signal?.throwIfAborted();
      const limits = capabilities.resources.memory_history;
      if (!limits.available) throw new ApiError(404, 'capability_not_supported', 'Memory history unavailable');
      const window_seconds = query?.window_seconds ?? limits.max_window_seconds!;
      const max_points = query?.max_points ?? limits.max_points!;
      if (
        !Number.isSafeInteger(window_seconds) ||
        window_seconds < 1 ||
        window_seconds > limits.max_window_seconds! ||
        !Number.isSafeInteger(max_points) ||
        max_points < 1 ||
        max_points > limits.max_points!
      )
        throw new ApiError(400, 'invalid_request', 'History query exceeds the advertised limits');
      // Synthesize five-second history with the memory snapshot's drift so their newest points agree.
      const now = Date.now();
      const every = 5;
      const count = Math.min(Math.floor(window_seconds / every), max_points);
      const stride = Math.max(1, Math.ceil(window_seconds / every / max_points));
      const samples = Array.from({length: count}, (_, i) => {
        const at = now - (count - 1 - i) * every * stride * 1000;
        const drift = 1 + 0.04 * Math.sin(at / 60000);
        return {
          sampled_at: new Date(at).toISOString(),
          rss_bytes: String(Math.round(Number(fixtures.runtimeMemory.process!.rss_bytes) * drift)),
          cgroup_current_bytes: String(Math.round(Number(fixtures.runtimeMemory.cgroup!.current_bytes) * drift)),
          kernel_ebpf_bytes: fixtures.runtimeMemory.kernel?.ebpf_bytes ?? null
        };
      });
      return {observed_at: new Date(now).toISOString(), window_seconds, sampled_every_seconds: every * stride, samples};
    },
    datapath: async (detail, signal) => {
      signal?.throwIfAborted();
      const snapshot = structuredClone(fixtures.datapath);
      if (detail !== 'full' && snapshot.ebpf) {
        delete snapshot.ebpf.attachments;
        delete snapshot.ebpf.maps;
      }
      return snapshot;
    },
    runtimeMemory: async signal => {
      signal?.throwIfAborted();
      // Each poll is a fresh observation with a little drift, so memory sparklines and charts get a shape.
      const memory = structuredClone(fixtures.runtimeMemory);
      const now = Date.now();
      const drift = 1 + 0.04 * Math.sin(now / 60000);
      memory.observed_at = new Date(now).toISOString();
      memory.process = {rss_bytes: String(Math.round(Number(fixtures.runtimeMemory.process!.rss_bytes) * drift))};
      memory.cgroup = {...memory.cgroup!, current_bytes: String(Math.round(Number(fixtures.runtimeMemory.cgroup!.current_bytes) * drift))};
      return memory;
    }
  };
  return {api, runtime, outbounds};
}
