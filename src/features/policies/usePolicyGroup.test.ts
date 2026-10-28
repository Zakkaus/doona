import {beforeEach, expect, it, vi} from 'vitest';
import {usePolicyGroup} from './usePolicyGroup';
import {hookHarness} from '../../store/testHelpers';
import {nodeFixtures} from '../../../mock/fixtures';
import {toast} from '../../ui/ui';
import type {ProbeResult} from '../../api/model';

const group = nodeFixtures(0).groups[0];
const state = vi.hoisted(() => ({result: null as ProbeResult | null}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  ...(await import('../../store/testHelpers')).hookHarness.hooks,
  useEffectEvent: (callback: unknown) => callback
}));
vi.mock('../../store', () => ({
  groupConflict: () => null,
  useGroupControl: () => ({data: group, network: 'both', busy: null, probeChoices: [], refetch: vi.fn(), probe: () => Promise.resolve(state.result)})
}));
vi.mock('./group/useGroupDialog', () => ({useGroupDialog: () => ({editing: false, editable: false, show: vi.fn(), view: vi.fn()})}));
vi.mock('./useCheckEdit', () => ({useCheckEdit: () => ({})}));
vi.mock('../../ui/ui', async original => ({...(await original<typeof import('../../ui/ui')>()), toast: vi.fn()}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});
const input = {
  id: group.id,
  name: group.name,
  health: new Map(),
  outbounds: {groups: [], nodes: []},
  refreshGroups: vi.fn(),
  refreshNodes: vi.fn(),
  source: {writable: false, busy: false},
  declaration: {owner: null},
  members: group.members.length,
  selection: {tcp_member_id: null, udp_member_id: null},
  paused: false,
  focused: false
} as unknown as Parameters<typeof usePolicyGroup>[0];
const rows = (...states: Array<'healthy' | 'unavailable' | 'unknown'>): ProbeResult['results'] =>
  states.map((health, index) => ({
    member_id: group.members[index].id,
    ip_version: 'ipv4',
    state: health,
    latency_ms: health === 'healthy' ? 40 : null,
    error: health === 'healthy' ? null : 'deadline'
  })) as ProbeResult['results'];
beforeEach(() => {
  hookHarness.reset();
  vi.clearAllMocks();
});
it.each([
  ['positive', rows('unavailable', 'healthy')],
  ['negative', rows('unavailable', 'unknown')],
  ['neutral', rows('unknown')]
])('reports the group probe as %s by its best member', async (level, results) => {
  state.result = {
    target: {type: 'group', group_id: group.id},
    selection_changed: {tcp: false, udp: false},
    selection_before: {tcp: null, udp: null},
    selection_after: {tcp: null, udp: null},
    results
  } as unknown as ProbeResult;
  hookHarness.render(() => usePolicyGroup(input)).probe();
  await vi.waitFor(() => expect(toast).toHaveBeenCalledOnce());
  expect(vi.mocked(toast).mock.calls[0][0]).toBe(level);
});

it.each([
  {filters: [], expected: []},
  {filters: ['name(hk-01)', 'subtag(paid)'], expected: null},
  {filters: ['name(hk-01)', 'subtag(paid) && !name(slow)'], expected: ['subtag(paid) && !name(slow)']},
  {filters: ['name(regex: custom)'], expected: ['name(regex: custom)']}
])('keeps only advanced membership filters from $filters in the summary', ({filters, expected}) => {
  const declaration = {owner: {entry: {filters}}} as Parameters<typeof usePolicyGroup>[0]['declaration'];
  expect(hookHarness.render(() => usePolicyGroup({...input, declaration})).includes.filters).toEqual(expected);
});
