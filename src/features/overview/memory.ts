import {useState} from 'react';
import type {Capabilities, MemoryHistory, RuntimeMemory} from '../../api/model';
import {useMemoryHistory} from '../../api/store';
import {parseU64} from '../../api/u64';

export type MemorySample = {time: number; rss: number | null; cgroup: number | null};
export const memorySampleLimit = 60;

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
export function resetMemorySamples() {
  history = [];
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

// The producer's ring when the backend advertises one; otherwise the polls collected in this session.
export function useMemorySeries(capabilities: Capabilities | undefined, memory: RuntimeMemory | undefined) {
  const history = useMemoryHistory(capabilities);
  const polled = useMemorySamples(memory);
  const advertised = capabilities?.resources.memory_history.available === true;
  return {
    samples: advertised && history.data ? historySamples(history.data) : polled,
    loading: advertised && !history.data && history.loading,
    error: advertised ? history.error : undefined
  };
}
