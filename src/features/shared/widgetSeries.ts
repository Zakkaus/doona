import type {Runtime} from '../../api/model';
import {mean, type Fold} from '../../api/rings';
export type CpuSample = {time: number; value: number | null};
export const cpuSample = (runtime: Runtime): CpuSample | undefined => {
  const time = Date.parse(runtime.observed_at);
  return Number.isFinite(time) ? {time, value: runtime.process.cpu_percent} : undefined;
};
export const foldCpu: Fold<CpuSample> = (samples, time) => ({time, value: mean(samples.map(sample => sample.value))});
