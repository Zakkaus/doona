import type {Runtime, TrafficHistory} from '../../api/model';
import {mean, window, type Fold, type Rings} from '../../api/rings';
import {parseU64} from '../../api/u64';
import type {Key} from '../../i18n';

type TrafficSample = {time: number; up: number | null; down: number | null; connections: number | null};
// Windows are seconds; live is two minutes at full resolution. Longer ranges use backend history when offered.
export const trafficRanges = {
  live: {seconds: 120, label: 'act.live'},
  m10: {seconds: 600, label: 'act.m10'},
  h1: {seconds: 3600, label: 'act.h1'},
  h6: {seconds: 21600, label: 'act.h6'},
  h24: {seconds: 86400, label: 'act.h24'},
  d7: {seconds: 604800, label: 'act.d7'}
} as const satisfies Record<string, {seconds: number; label: Key}>;
export type TrafficRange = keyof typeof trafficRanges;
export const isTrafficRange = (value: string): value is TrafficRange => Object.hasOwn(trafficRanges, value);
const rate = (value: string | null | undefined) => {
  const parsed = parseU64(value ?? null);
  return parsed === null ? null : Number(parsed) / 1000;
};

export const foldTraffic: Fold<TrafficSample> = (group, time) => ({
  time,
  up: mean(group.map(s => s.up)),
  down: mean(group.map(s => s.down)),
  connections: group.some(s => s.connections !== null) ? Math.max(...group.map(s => s.connections ?? 0)) : null
});

// With an eBPF datapath the kernel forwards some direct connections on its own; a backend that counts only what
// passes through userspace then leaves their bytes out of every rate, history and connection figure.
export const kernelTrafficUncounted = (runtime: Pick<Runtime, 'datapath' | 'traffic'> | undefined) =>
  runtime?.traffic.observed_by === 'userspace' && runtime.datapath.kind === 'ebpf';

export function trafficSample(runtime: Runtime): TrafficSample | undefined {
  const traffic = runtime.traffic;
  const time = Date.parse(traffic.sampled_at ?? '');
  if (!Number.isFinite(time)) return undefined;
  return {
    time,
    up: rate(traffic.rates?.upload_bytes_per_second),
    down: rate(traffic.rates?.download_bytes_per_second),
    connections: traffic.connections.total
  };
}

export function historyTrafficSamples(history: TrafficHistory): TrafficSample[] {
  return history.samples.map(s => ({
    time: Date.parse(s.sampled_at),
    up: rate(s.upload_bytes_per_second),
    down: rate(s.download_bytes_per_second),
    connections: s.connections
  }));
}

type TrafficSeries = {
  timestamps: number[];
  down: Array<number | null>;
  up: Array<number | null>;
  connections: Array<number | null>;
  since: number;
  until: number;
};

export function trafficWindow(rings: Rings<TrafficSample>, ring: TrafficSample[], windowSeconds: number, now?: number, maxPoints?: number): TrafficSeries {
  const {samples, since, until} = window(rings, ring, windowSeconds, foldTraffic, now, maxPoints);
  return {
    timestamps: samples.map(s => s.time),
    down: samples.map(s => s.down),
    up: samples.map(s => s.up),
    connections: samples.map(s => s.connections),
    since,
    until
  };
}
