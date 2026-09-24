import type {Runtime, TrafficHistory} from '../../api/model';
import {mean, useRings, window, type Fold, type Rings} from '../../api/rings';
import {parseU64} from '../../api/u64';

type TrafficSample = {time: number; up: number | null; down: number | null; connections: number | null};
// Windows are seconds; live is two minutes at full resolution. Longer ranges use backend history when offered.
export const trafficWindows: Record<string, number> = {live: 120, m10: 600, h1: 3600, h6: 21600, h24: 86400, d7: 604800};
const rate = (value: string | null | undefined) => {
  const parsed = parseU64(value ?? null);
  return parsed === null ? null : Number(parsed) / 1000;
};

const foldTraffic: Fold<TrafficSample> = (group, time) => ({
  time,
  up: mean(group.map(s => s.up)),
  down: mean(group.map(s => s.down)),
  connections: group.some(s => s.connections !== null) ? Math.max(...group.map(s => s.connections ?? 0)) : null
});

function trafficSample(runtime: Runtime): TrafficSample | undefined {
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

export function useTrafficSamples(runtime: Runtime | undefined): Rings<TrafficSample> {
  return useRings('traffic', runtime, trafficSample, foldTraffic);
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

export function trafficWindow(rings: Rings<TrafficSample>, ring: TrafficSample[], windowSeconds: number, now = Date.now(), maxPoints?: number): TrafficSeries {
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
