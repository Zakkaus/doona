import {expect, it} from 'vitest';
import type {RuntimeMemory} from '../../api/model';
import {appendMemorySample, memorySampleLimit, type MemorySample} from './memory';

it('bounds memory history, preserves unknown metrics and ignores duplicate timestamps', () => {
  const memory: RuntimeMemory = {observed_at: '', process: {rss_bytes: '1000000'}, cgroup: null, kernel: null};
  let samples: MemorySample[] = [];
  for (let i = 0; i <= memorySampleLimit; i++) {
    memory.observed_at = new Date(i * 5000).toISOString();
    samples = appendMemorySample(samples, memory);
  }
  expect(samples.map(sample => sample.time)).toEqual(Array.from({length: memorySampleLimit}, (_, i) => (i + 1) * 5000));
  expect(samples.at(-1)).toEqual({time: memorySampleLimit * 5000, rss: 1000000, cgroup: null});
  expect(appendMemorySample(samples, memory)).toEqual(samples);
  memory.observed_at = new Date(0).toISOString();
  memory.process = null;
  expect(appendMemorySample(samples, memory)).toEqual([{time: 0, rss: null, cgroup: null}]);
});
