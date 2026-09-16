import {expect, it} from 'vitest';
import type {RuntimeMemory} from '../../api/model';
import {appendMemorySample, historySamples, memorySampleLimit, type MemorySample} from './memory';

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

it('maps a history ring to samples and keeps unknown metrics null', () => {
  expect(
    historySamples({
      observed_at: '2026-08-15T10:00:00Z',
      window_seconds: 10,
      sampled_every_seconds: 5,
      samples: [
        {sampled_at: '2026-08-15T09:59:55Z', rss_bytes: '48234496', cgroup_current_bytes: null},
        {sampled_at: '2026-08-15T10:00:00Z', rss_bytes: null, cgroup_current_bytes: '67108864', kernel_ebpf_bytes: '1'}
      ]
    })
  ).toEqual([
    {time: Date.parse('2026-08-15T09:59:55Z'), rss: 48234496, cgroup: null},
    {time: Date.parse('2026-08-15T10:00:00Z'), rss: null, cgroup: 67108864}
  ]);
});
