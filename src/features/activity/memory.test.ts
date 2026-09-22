import {expect, it} from 'vitest';
import type {RuntimeMemory} from '../../api/model';
import {historySamples, memorySample, memoryWindow} from './memory';

it('reads a memory observation, keeping unknown metrics null', () => {
  const memory: RuntimeMemory = {observed_at: '2026-08-15T10:00:00Z', process: {rss_bytes: '1000000'}, cgroup: null, kernel: null};
  expect(memorySample(memory)).toEqual({time: Date.parse('2026-08-15T10:00:00Z'), rss: 1000000, cgroup: null});
  expect(memorySample({...memory, observed_at: ''})).toBeUndefined();
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

it('derives chart arrays from history followed by polls, retaining null metrics and clipping the window', () => {
  const series = memoryWindow(
    {fine: [{time: 15000, rss: 200, cgroup: null}], coarse: []},
    [
      {time: 0, rss: 50, cgroup: 80},
      {time: 5000, rss: null, cgroup: 100},
      {time: 10000, rss: 150, cgroup: 250}
    ],
    10,
    15000
  );
  expect(series).toEqual({
    since: 5000,
    until: 15000,
    samples: [
      {time: 5000, rss: null, cgroup: 100},
      {time: 10000, rss: 150, cgroup: 250},
      {time: 15000, rss: 200, cgroup: null}
    ],
    timestamps: [5000, 10000, 15000],
    rss: [null, 150, 200],
    cgroup: [100, 250, null]
  });
});
