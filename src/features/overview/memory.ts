import {useMemo} from 'react';
import type {Capabilities, MemoryHistory, RuntimeMemory} from '../../api/model';
import {mean, useRings, window, type Fold, type Rings} from '../../api/rings';
import {useMemoryHistory} from '../../api/store';
import {parseU64} from '../../api/u64';

export type MemorySample = {time: number; rss: number | null; cgroup: number | null};

export const foldMemory: Fold<MemorySample> = (group, time) => ({time, rss: mean(group.map(s => s.rss)), cgroup: mean(group.map(s => s.cgroup))});

export function memorySample(memory: RuntimeMemory): MemorySample | undefined {
  const time = Date.parse(memory.observed_at);
  if (!Number.isFinite(time)) return undefined;
  const rss = parseU64(memory.process?.rss_bytes ?? null);
  const cgroup = parseU64(memory.cgroup?.current_bytes ?? null);
  return {time, rss: rss === null ? null : Number(rss), cgroup: cgroup === null ? null : Number(cgroup)};
}

export function useMemorySamples(memory: RuntimeMemory | undefined): Rings<MemorySample> {
  return useRings('memory', memory, memorySample, foldMemory);
}

export function historySamples(history: MemoryHistory): MemorySample[] {
  return history.samples.map(sample => {
    const rss = parseU64(sample.rss_bytes);
    const cgroup = parseU64(sample.cgroup_current_bytes);
    return {time: Date.parse(sample.sampled_at), rss: rss === null ? null : Number(rss), cgroup: cgroup === null ? null : Number(cgroup)};
  });
}

export function memoryWindow(rings: Rings<MemorySample>, history: MemorySample[], windowSeconds: number, now = Date.now()) {
  const series = window(rings, history, windowSeconds, foldMemory, now);
  return {
    ...series,
    timestamps: series.samples.map(sample => sample.time),
    rss: series.samples.map(sample => sample.rss),
    cgroup: series.samples.map(sample => sample.cgroup)
  };
}

export function useMemorySeries(capabilities: Capabilities | undefined, memory: RuntimeMemory | undefined, windowSeconds: number) {
  const history = useMemoryHistory(capabilities);
  const rings = useMemorySamples(memory);
  const advertised = capabilities?.resources.memory_history.available === true;
  const converted = useMemo(() => (history.data ? historySamples(history.data) : []), [history.data]);
  const series = useMemo(() => memoryWindow(rings, advertised ? converted : [], windowSeconds), [rings, converted, advertised, windowSeconds]);
  return {
    ...series,
    loading: advertised && !history.data && history.loading,
    error: advertised ? history.error : undefined
  };
}
