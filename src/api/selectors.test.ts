import {expect, it} from 'vitest';
import type {ApiEvent} from './model';
import {routineGap, shortId} from './selectors';

const gap = (reason: string, resource_id: string | null): ApiEvent =>
  ({
    id: 'x',
    event: 'flow.gap',
    data: {instance_id: 'i', observed_at: '2026-09-19T00:00:00Z', resource_id, reason, dropped_records: '1'}
  }) as ApiEvent;

it('treats the ring making room as housekeeping and a record losing its history as a gap', () => {
  expect(routineGap(gap('evicted', null))).toBe(true);
  expect(routineGap(gap('sampled', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', 'flow-1'))).toBe(false);
  expect(routineGap(gap('recording_changed', null))).toBe(false);
  expect(routineGap({id: 'y', event: 'stream.ready', data: {instance_id: 'i', observed_at: ''}} as ApiEvent)).toBe(false);
});

it('shortens a UUID to its first block and leaves other ids alone', () => {
  expect(shortId('e5af7786-442b-4f06-8ba5-ffa47f7dec70')).toBe('e5af7786');
  expect(shortId('gen-41')).toBe('gen-41');
  expect(shortId('—')).toBe('—');
});
