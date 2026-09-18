import {useState} from 'react';
import type {Capabilities, MemoryHistory, RuntimeMemory} from '../../api/model';
import {useMemoryHistory} from '../../api/store';
import {parseU64} from '../../api/u64';

export type MemorySample = {time: number; rss: number | null; cgroup: number | null};
// An hour of five-second polls: the backend's ring covers ten minutes, the session keeps the rest.
export const memorySampleLimit = 720;

export function appendMemorySample(samples: MemorySample[], memory: RuntimeMemory): MemorySample[] {
  const time = Date.parse(memory.observed_at);
  if (!Number.isFinite(time) || samples.at(-1)?.time === time) return samples;
  const rss = parseU64(memory.process?.rss_bytes ?? null);
  const cgroup = parseU64(memory.cgroup?.current_bytes ?? null);
  const sample = {time, rss: rss === null ? null : Number(rss), cgroup: cgroup === null ? null : Number(cgroup)};
  if (samples.length && time < samples[samples.length - 1].time) return [sample];
  return [...samples.slice(-(memorySampleLimit - 1)), sample];
}

// One history for the whole session: the curve keeps growing while the user moves between pages.
let history: MemorySample[] = [];
function record(memory: RuntimeMemory | undefined): MemorySample[] {
  if (memory) history = appendMemorySample(history, memory);
  return history;
}
export function useMemorySamples(memory: RuntimeMemory | undefined) {
  const [observed, setObserved] = useState(memory);
  const [samples, setSamples] = useState<MemorySample[]>(() => record(memory));
  if (observed !== memory) {
    setObserved(memory);
    setSamples(record(memory));
  }
  return samples;
}

export function historySamples(history: MemoryHistory): MemorySample[] {
  return history.samples.map(sample => {
    const rss = parseU64(sample.rss_bytes);
    const cgroup = parseU64(sample.cgroup_current_bytes);
    return {time: Date.parse(sample.sampled_at), rss: rss === null ? null : Number(rss), cgroup: cgroup === null ? null : Number(cgroup)};
  });
}

// Two rings on one time axis: the polls this session collected, and the backend's, which reaches back before
// the page was opened. Where both have a second, the backend's sample wins.
export function mergeSamples(polled: MemorySample[], history: MemorySample[]): MemorySample[] {
  const byTime = new Map<number, MemorySample>();
  for (const sample of polled) byTime.set(sample.time, sample);
  for (const sample of history) byTime.set(sample.time, sample);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

// The backend's ring merged with the polls collected in this session; the polls alone without a ring.
export function useMemorySeries(capabilities: Capabilities | undefined, memory: RuntimeMemory | undefined) {
  const history = useMemoryHistory(capabilities);
  const polled = useMemorySamples(memory);
  const advertised = capabilities?.resources.memory_history.available === true;
  return {
    samples: advertised && history.data ? mergeSamples(polled, historySamples(history.data)) : polled,
    loading: advertised && !history.data && history.loading,
    error: advertised ? history.error : undefined
  };
}
