import {useState} from 'react';
import type {Runtime, TrafficHistory} from '../../api/model';
import {parseU64} from '../../api/u64';

// One traffic sample on the chart: rates in KB/s, the connection count, and when the backend sampled it.
export type TrafficSample = {time: number; up: number | null; down: number | null; connections: number | null};
// An hour of five-second polls: the backend's ring covers ten minutes, the session keeps the rest.
export const trafficSampleLimit = 720;
const rate = (value: string | null | undefined) => (value == null ? null : Number(parseU64(value)) / 1000);

export function appendTrafficSample(samples: TrafficSample[], runtime: Runtime): TrafficSample[] {
  const traffic = runtime.traffic;
  const time = Date.parse(traffic.sampled_at ?? '');
  if (!Number.isFinite(time) || samples.at(-1)?.time === time) return samples;
  const sample = {
    time,
    up: rate(traffic.rates?.upload_bytes_per_second),
    down: rate(traffic.rates?.download_bytes_per_second),
    connections: traffic.connections.total
  };
  // A backend restart brings an earlier clock; the session ring starts over.
  if (samples.length && time < samples[samples.length - 1].time) return [sample];
  return [...samples.slice(-(trafficSampleLimit - 1)), sample];
}

// One history for the whole session: the curve keeps growing while the user moves between pages.
let history: TrafficSample[] = [];
function record(runtime: Runtime | undefined): TrafficSample[] {
  if (runtime) history = appendTrafficSample(history, runtime);
  return history;
}
export function useTrafficSamples(runtime: Runtime | undefined) {
  const [observed, setObserved] = useState(runtime);
  const [samples, setSamples] = useState<TrafficSample[]>(() => record(runtime));
  if (observed !== runtime) {
    setObserved(runtime);
    setSamples(record(runtime));
  }
  return samples;
}

export function historyTrafficSamples(history: TrafficHistory): TrafficSample[] {
  return history.samples.map(s => ({
    time: Date.parse(s.sampled_at),
    up: rate(s.upload_bytes_per_second),
    down: rate(s.download_bytes_per_second),
    connections: s.connections
  }));
}

// The backend's ring merged with this session's polls, clipped to the chosen window; where both have a
// second, the backend's sample wins.
export function trafficWindow(polled: TrafficSample[], ring: TrafficSample[], windowSeconds: number, now = Date.now()) {
  const byTime = new Map<number, TrafficSample>();
  for (const sample of polled) byTime.set(sample.time, sample);
  for (const sample of ring) byTime.set(sample.time, sample);
  const since = now - windowSeconds * 1000;
  const samples = [...byTime.values()].filter(sample => sample.time >= since).sort((a, b) => a.time - b.time);
  return {
    timestamps: samples.map(s => s.time),
    down: samples.map(s => s.down),
    up: samples.map(s => s.up),
    connections: samples.map(s => s.connections)
  };
}
