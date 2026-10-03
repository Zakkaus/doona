import type {Node, Runtime} from '../../api/model';
import {mean, window, type Fold, type Rings} from '../../api/rings';
import {healthMillis, preferredHealth} from '../../api/selectors';
export type CpuSample = {time: number; value: number | null};
export const cpuSample = (runtime: Runtime): CpuSample | undefined => {
  const time = Date.parse(runtime.observed_at);
  return Number.isFinite(time) ? {time, value: runtime.process.cpu_percent} : undefined;
};
export const foldCpu: Fold<CpuSample> = (samples, time) => ({time, value: mean(samples.map(sample => sample.value))});

// A node's latency at a read of the node list; a failed probe, a missing observation or a node gone from the list is a gap.
export const latencySample = (node: Node | undefined, time: number): CpuSample => ({time, value: (node && healthMillis(preferredHealth(node))) ?? null});

// A tile's trend line: the window's samples, thinned to the points a sparkline can show. Each run of known readings is
// thinned on its own and one null stays between runs, so a failed poll still breaks the line.
export const sparkPoints = 24;
export function thin<T extends CpuSample>(samples: T[], fold: Fold<T>): T[] {
  if (samples.length <= sparkPoints) return samples;
  const size = Math.ceil(samples.length / sparkPoints);
  const thinned: T[] = [];
  let run: T[] = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += size) thinned.push(fold(run.slice(i, i + size), run[i].time));
    run = [];
  };
  for (const sample of samples) {
    if (sample.value !== null) run.push(sample);
    else {
      flush();
      if (thinned.at(-1)?.value !== null) thinned.push(sample);
    }
  }
  flush();
  return thinned;
}
export function sparkWindow<T extends CpuSample>(rings: Rings<T>, windowSeconds: number, fold: Fold<T>) {
  const samples = thin(window(rings, [], windowSeconds, fold, undefined, Infinity).samples, fold);
  return {timestamps: samples.map(sample => sample.time), values: samples.map(sample => sample.value)};
}
