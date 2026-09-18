import {expect, it} from 'vitest';
import type {ApiEvent} from './model';
import {routineGap} from './selectors';

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
