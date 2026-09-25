import {afterEach, expect, it} from 'vitest';
import {noteServerTime, resetServerClock} from '../../api/serverClock';
import {historyTrafficSamples, trafficWindow} from './traffic';

afterEach(resetServerClock);

it('places the live window on the host clock, so a lagging host still charts', () => {
  const host = Date.now() - 600_000;
  noteServerTime(new Date(host).toISOString());
  const samples = [5, 4, 3].map(back => ({time: host - back * 1000, up: 1, down: 1, connections: 1}));
  const series = trafficWindow({fine: [], coarse: []}, samples, 120);
  expect(series.timestamps).toEqual(samples.map(s => s.time));
});

it('maps a history ring to samples in KB/s and keeps unknown rates null', () => {
  expect(
    historyTrafficSamples({
      observed_at: '2026-08-15T10:00:00Z',
      window_seconds: 10,
      sampled_every_seconds: 5,
      samples: [
        {sampled_at: '2026-08-15T09:59:55Z', upload_bytes_per_second: '2000', download_bytes_per_second: '512000', connections: 12},
        {sampled_at: '2026-08-15T10:00:00Z', upload_bytes_per_second: '1000', download_bytes_per_second: null, connections: null}
      ]
    })
  ).toEqual([
    {time: Date.parse('2026-08-15T09:59:55Z'), up: 2, down: 512, connections: 12},
    {time: Date.parse('2026-08-15T10:00:00Z'), up: 1, down: null, connections: null}
  ]);
});

it('keeps malformed rates unknown rather than converting them to zero', () => {
  expect(
    historyTrafficSamples({
      observed_at: '2026-08-15T10:00:00Z',
      window_seconds: 5,
      sampled_every_seconds: 5,
      samples: [{sampled_at: '2026-08-15T10:00:00Z', upload_bytes_per_second: 'broken', download_bytes_per_second: '0', connections: 0}]
    })
  ).toEqual([{time: Date.parse('2026-08-15T10:00:00Z'), up: null, down: 0, connections: 0}]);
});
