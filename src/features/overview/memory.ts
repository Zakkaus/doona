import {useState} from 'react';
import type {RuntimeMemory} from '../../api/model';
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

export function useMemorySamples(memory: RuntimeMemory | undefined) {
  const [observed, setObserved] = useState(memory);
  const [samples, setSamples] = useState<MemorySample[]>(() => (memory ? appendMemorySample([], memory) : []));
  if (observed !== memory) {
    setObserved(memory);
    setSamples(memory ? appendMemorySample(samples, memory) : []);
  }
  return samples;
}
