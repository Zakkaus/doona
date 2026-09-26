import {expect, it} from 'vitest';
import type {ApiEvent, GroupSummary} from './model';
import {eventSummary, nodeOwner, resolveSelectedLeaf, routineGap, shortId} from './selectors';
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
  expect(routineGap(gap('buffer_overflow', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', 'flow-1'))).toBe(true);
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

it('starts a gap summary at its reason when the gap names no record', () => {
  const unscoped = eventSummary(gap('recording_changed', null));
  expect(translate('en', unscoped.key, unscoped.params)).toBe('reason: recording_changed, records dropped: 1');
  const scoped = eventSummary(gap('buffer_overflow', 'flow-r03'));
  expect(translate('en', scoped.key, scoped.params)).toMatch(/^flow-r03, reason: /);
});

it('leaves the count out of a gap that dropped no records, but keeps an unknown one', () => {
  const summary = (resource_id: string | null, dropped_records: string | null) => {
    const event = gap('recording_changed', resource_id) as Extract<ApiEvent, {event: 'flow.gap'}>;
    const {key, params} = eventSummary({...event, data: {...event.data, dropped_records}} as ApiEvent);
    return translate('en', key, params);
  };
  expect(summary(null, '0')).toBe('reason: recording_changed');
  expect(summary('flow-r03', '0')).toBe('flow-r03, reason: recording_changed');
  expect(summary(null, null)).toBe('reason: recording_changed, records dropped: —');
});

it('files a node under its provider, or under the built-in or unattributed owner the nodes page lists', () => {
  expect(nodeOwner({provider_id: 'sub', protocol: 'vmess'}, [])).toBe('sub');
  expect(nodeOwner({provider_id: null, protocol: 'direct'}, [])).toBe('builtin');
  expect(nodeOwner({provider_id: null, protocol: 'vmess'}, [])).toBe('unattributed');
  // A real provider that happens to use the pseudo owner's id keeps it; the pseudo owner moves aside.
  expect(nodeOwner({provider_id: null, protocol: 'block'}, [{id: 'builtin'}, {id: 'builtin-'}])).toBe('builtin--');
});
