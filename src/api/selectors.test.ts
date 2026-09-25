import {expect, it} from 'vitest';
import type {ApiEvent, GroupSummary} from './model';
import {eventSummary, resolveSelectedLeaf, routineGap, shortId} from './selectors';
import {formatNumber, LOCALE, readLang, translate} from '../i18n';
import {createMockApi} from './mock';

const gap = (reason: string, resource_id: string | null): ApiEvent =>
  ({
    id: 'x',
    event: 'flow.gap',
    data: {instance_id: 'i', observed_at: '2026-09-19T00:00:00Z', resource_id, reason, dropped_records: '1'}
  }) as ApiEvent;

it('treats the ring making room as housekeeping and a record losing its history as a gap', () => {
  expect(routineGap(gap('evicted', null))).toBe(true);
  expect(routineGap(gap('sampled', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', null))).toBe(false);
  expect(routineGap(gap('buffer_overflow', 'flow-1'))).toBe(false);
  expect(routineGap(gap('recording_changed', null))).toBe(false);
  expect(routineGap({id: 'y', event: 'stream.ready', data: {instance_id: 'i', observed_at: ''}} as ApiEvent)).toBe(false);
});

it('shortens a UUID to its first block and leaves other ids alone', () => {
  expect(shortId('e5af7786-442b-4f06-8ba5-ffa47f7dec70')).toBe('e5af7786');
  expect(shortId('gen-41')).toBe('gen-41');
  expect(shortId('—')).toBe('—');
});

it('resolves deep group chains and stops at an actual cycle', async () => {
  const api = createMockApi();
  const node = (await api.nodes()).nodes[0];
  const template = (await api.groups())[0];
  const groups: GroupSummary[] = Array.from({length: 12}, (_, index) => ({
    ...template,
    id: `g${index}`,
    name: `g${index}`,
    selection: {tcp_member_id: index === 11 ? node.id : `g${index + 1}`, udp_member_id: null}
  }));
  const byId = new Map(groups.map(group => [group.id, group]));
  const nodes = new Map([[node.id, node]]);
  expect(resolveSelectedLeaf('g0', 'tcp', byId, byId, nodes)).toEqual({groups, member: node.id, node});
  groups[11].selection.tcp_member_id = 'g0';
  expect(resolveSelectedLeaf('g0', 'tcp', byId, byId, nodes)).toEqual({groups, member: null, node: null});
});

it('groups dropped counts in gap summaries without rounding a large UInt64', () => {
  const dropped = (dropped_records: string | null) => {
    const event = gap('buffer_overflow', null) as Extract<ApiEvent, {event: 'flow.gap'}>;
    return eventSummary({...event, data: {...event.data, dropped_records}} as ApiEvent);
  };
  expect(translate('en', 'event.gap', dropped('12345').params)).toContain('12,345');
  expect(dropped('18446744073709551615').params?.n).toBe(formatNumber(18446744073709551615n, LOCALE[readLang()]));
  expect(dropped(null).params?.n).toBe('—');
});
