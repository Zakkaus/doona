import type {Runtime, TrafficHistory} from '../../api/model';
import {mean, useRings, window, type Fold, type Rings} from '../../api/rings';
import {parseU64} from '../../api/u64';

// One traffic sample on the chart: rates in KB/s, the connection count, and when the backend sampled it.
export type TrafficSample = {time: number; up: number | null; down: number | null; connections: number | null};
// The chart's windows in seconds. Live is what other dashboards call the last two minutes at full resolution;
// the rest are the fixed spans a router page is read at. The backend's own ring covers ten minutes at one
// second; the session's polls carry the longer spans, in minute buckets.
export const trafficWindows: Record<string, number> = {live: 120, m10: 600, h1: 3600, h6: 21600, h24: 86400, d7: 604800};
const rate = (value: string | null | undefined) => (value == null ? null : Number(parseU64(value)) / 1000);

// A bucket averages the rates and keeps the highest connection count seen in it.
export const foldTraffic: Fold<TrafficSample> = (group, time) => ({
  time,
  up: mean(group.map(s => s.up)),
  down: mean(group.map(s => s.down)),
  connections: group.some(s => s.connections !== null) ? Math.max(...group.map(s => s.connections ?? 0)) : null
});

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

export type TrafficSeries = {
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
