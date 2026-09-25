import type {MemoryHistory, RuntimeMemory} from '../../api/model';
import {mean, useRings, window, type Fold, type Rings} from '../../api/rings';
import {parseU64} from '../../api/u64';

type MemorySample = {time: number; rss: number | null; cgroup: number | null};

const foldMemory: Fold<MemorySample> = (group, time) => ({time, rss: mean(group.map(s => s.rss)), cgroup: mean(group.map(s => s.cgroup))});

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

export function memoryWindow(rings: Rings<MemorySample>, history: MemorySample[], windowSeconds: number, now?: number) {
  const series = window(rings, history, windowSeconds, foldMemory, now);
  return {
    ...series,
    timestamps: series.samples.map(sample => sample.time),
    rss: series.samples.map(sample => sample.rss),
    cgroup: series.samples.map(sample => sample.cgroup)
  };
}
