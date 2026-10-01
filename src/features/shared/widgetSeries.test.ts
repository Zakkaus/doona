import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {cpuSample, foldCpu} from './widgetSeries';

it('preserves unknown CPU readings and multicore percentages', async () => {
  const runtime = await createMockApi().runtime();
  runtime.process.cpu_percent = null;
  expect(cpuSample(runtime)?.value).toBeNull();
  runtime.process.cpu_percent = 145;
  expect(cpuSample(runtime)?.value).toBe(145);
  expect(
    foldCpu(
      [
        {time: 1, value: 145},
        {time: 2, value: null}
      ],
      3
    )
  ).toEqual({time: 3, value: 145});
  expect(foldCpu([{time: 1, value: null}], 2).value).toBeNull();
  runtime.observed_at = 'invalid';
  expect(cpuSample(runtime)).toBeUndefined();
});
