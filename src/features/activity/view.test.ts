import {expect, it} from 'vitest';
import {connections, nodeFixtures, runtime, runtimeOutbounds} from '../../api/mock/fixtures';
import type {Connection, ConnectionList, GroupSummary} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {pickMenuKey} from '../../ui/ui';
import {
  activityOutbounds,
  activityRanking,
  activityView,
  interestingNotice,
  modeReasons,
  modeView,
  activityGroupView,
  nodeView,
  noticeRows,
  setupNotices,
  trafficState
} from './view';
const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);
const colors = {cat: ['blue', 'green'], love: 'red'};

it('distinguishes missing metrics from zero and keeps block traffic separate from named groups', () => {
  const missing = activityView(undefined, t);
  expect(missing.connections).toBe('—');
  expect(missing.cpu).toBe('—');
  const model = activityView({...runtime, traffic: {...runtime.traffic, connections: {tcp: 0, udp: 0, total: 0}}}, t);
  expect(model.connections).toBe('0');
  expect(activityOutbounds(runtimeOutbounds, 'en-US', colors, t).rows.find(row => row.name === t('ui.block'))?.color).toBe('red');
  const ranking = activityRanking(connections, 'dev', colors, 'en', t);
  expect(ranking[0].pct).toBeGreaterThan(ranking[1].pct);
  expect(ranking[0].href).toBe(`#/connections?src=${ranking[0].name}`);
  const domains = activityRanking(connections, 'host', colors, 'en', t);
  expect(domains[0].href).toBe(`#/connections?q=${encodeURIComponent(domains[0].name)}`);
  const only = activityRanking({...connections, tcp: connections.tcp.slice(0, 1), udp: []}, 'host', colors, 'en', t);
  expect(only[0].value).toMatch(/, 100%$/);
  const usage = activityOutbounds(runtimeOutbounds, 'en-US', colors, t).rows;
  expect(usage.find(row => row.name === t('ui.block'))?.href).toBe('#/connections?out=block');
});

it('chooses measured nodes and preserves an explicitly selected unavailable node', () => {
  const {nodes} = nodeFixtures(0, true);
  expect(nodeView(nodes, '', t).name).toBe('hk-01');
  const unavailable = nodeView(nodes, 'jp-01', t);
  expect(unavailable.tone).toBe('err');
  expect(unavailable.latency).toBe('—');
  expect(unavailable.status).toBe(t('act.unavailable'));
  // honk's failure code reads as words in the page language.
  expect(nodes.find(node => node.id === 'jp-01')?.health[0].error).toBe('probe_failed');
  expect(unavailable.healthError).toBe(t('ui.backend.probeFailed'));
  expect(nodeView([], '', t).tone).toBe('muted');
});

const groupFixtures = () => {
  const {nodes, groups} = nodeFixtures(0, true);
  const summaries: GroupSummary[] = groups.map(group => ({
    id: group.id,
    name: group.name,
    icon: group.icon,
    config_revision: group.config_revision,
    policy: group.policy,
    member_count: group.members.length,
    selection: {tcp_member_id: group.runtime.selection.tcp?.member_id ?? null, udp_member_id: group.runtime.selection.udp?.member_id ?? null}
  }));
  return {nodes, groups: summaries};
};
const connection = (outbound: string | null, state: Connection['state'] = 'active') => ({...connections.tcp[0], outbound, chain: ['gaming', 'jp-01'], state});

it('counts active TCP and UDP connections by outbound name and keeps group list order on ties', () => {
  const {nodes, groups} = groupFixtures();
  const snapshot: ConnectionList = {...connections, tcp: [connection('resilient'), connection('proxy')], udp: [connection('resilient')]};
  expect(activityGroupView(groups, nodes, '', t, snapshot).groupName).toBe('resilient');
  const ignored = ['closed', 'blocked', 'failed', 'dialing'].map(state => connection('resilient', state as Connection['state']));
  expect(
    activityGroupView(groups, nodes, '', t, {...snapshot, tcp: [...snapshot.tcp, ...ignored, connection(null), connection('missing')], udp: []}).groupName
  ).toBe('proxy');
  const renamed = groups.map(group => ({...group, id: `id-${group.id}`}));
  expect(activityGroupView(renamed, nodes, '', t, snapshot).groupName).toBe('resilient');
});

it('resolves nested groups by member ID, keeps one transport and handles missing or cyclic selections', () => {
  const {nodes, groups} = groupFixtures();
  groups[0].selection.tcp_member_id = groups[1].id;
  expect(activityGroupView(groups, nodes, groups[0].id, t)).toMatchObject({id: 'sg-01', name: 'sg-01', groupName: 'proxy', latency: '63 ms'});
  groups[1].selection.tcp_member_id = null;
  expect(activityGroupView(groups, nodes, groups[0].id, t)).toMatchObject({id: '', name: '', groupName: 'proxy', latency: '—'});
  groups[0].selection.tcp_member_id = null;
  groups[0].selection.udp_member_id = groups[1].id;
  expect(activityGroupView(groups, nodes, groups[0].id, t).id).toBe('sg-01');
  groups[0].selection.tcp_member_id = groups[1].id;
  groups[1].selection.tcp_member_id = groups[0].id;
  expect(activityGroupView(groups, nodes, groups[0].id, t).latency).toBe('—');
  groups[0].selection.tcp_member_id = 'missing';
  expect(activityGroupView(groups, nodes, groups[0].id, t).id).toBe('');
});

it('uses the first measured active group without connections and the node fallback without groups', () => {
  const {nodes, groups} = groupFixtures();
  groups[0].selection.tcp_member_id = 'jp-01';
  for (const snapshot of [undefined, {...connections, tcp: [], udp: []}, {...connections, tcp: [connection('missing')], udp: []}]) {
    expect(activityGroupView(groups, nodes, '', t, snapshot).groupName).toBe('resilient');
  }
  expect(activityGroupView([], nodes, '', t)).toMatchObject({id: 'hk-01', name: 'hk-01', chosen: '', options: []});
  expect(activityGroupView([], [], '', t).latency).toBe('—');
});

it('shows an em dash for an unmeasured active node even when its group is busiest', () => {
  const {nodes, groups} = groupFixtures();
  nodes[0].health = [];
  const snapshot = {...connections, tcp: [connection('proxy')], udp: []};
  expect(activityGroupView(groups, nodes, '', t, snapshot)).toMatchObject({id: 'hk-01', latency: '—', status: t('act.unknown')});
  expect(activityGroupView(groups, nodes, 'proxy', t).latency).toBe('—');
  nodes[0].health = nodeFixtures(0).nodes[0].health.map(h => ({...h, latency_ms: 0}));
  expect(activityGroupView(groups, nodes, 'proxy', t).latency).toBe('0 ms');
});

it('remembers a group, follows its current member and defaults when a stored group disappears or follow is chosen', () => {
  const {nodes, groups} = groupFixtures();
  const snapshot = {...connections, tcp: [connection('resilient')], udp: []};
  expect(activityGroupView(groups, nodes, 'proxy', t, snapshot)).toMatchObject({id: 'hk-01', chosen: 'proxy'});
  groups[0].selection.tcp_member_id = 'jp-01';
  expect(activityGroupView(groups, nodes, 'proxy', t, snapshot)).toMatchObject({id: 'jp-01', chosen: 'proxy', latency: '—'});
  expect(activityGroupView(groups.slice(1), nodes, 'proxy', t, snapshot)).toMatchObject({id: 'sg-01', chosen: ''});
  let chosen = 'proxy';
  pickMenuKey(id => (chosen = id))(new Set(['']));
  expect(activityGroupView(groups, nodes, chosen, t, snapshot)).toMatchObject({id: 'sg-01', chosen: ''});
});

it('tones the latency tile like the nodes table, by speed', () => {
  const {nodes} = nodeFixtures(0, true);
  const hk = nodes.find(node => node.id === 'hk-01')!;
  const at = (latency_ms: number) => nodeView([{...hk, health: hk.health.map(h => (h.transport === 'tcp' ? {...h, latency_ms} : h))}], 'hk-01', t).latencyClass;
  expect(at(99)).toBe('rp-big ms ok');
  expect(at(100)).toBe('rp-big ms warn');
  expect(at(299)).toBe('rp-big ms warn');
  expect(at(300)).toBe('rp-big ms err');
  expect(nodeView(nodes, 'jp-01', t).latencyClass).toBe('rp-big');
});

it('stages global targets without changing the current mode and detects an unchanged selection', () => {
  const {groups} = nodeFixtures(0);
  const staged = modeView({mode: 'rule'}, {mode: 'global', target: 'resilient'}, groups, true, true, t);
  expect(staged).toMatchObject({mode: 'global', target: 'resilient', dirty: true});
  expect(modeView({mode: 'global', target: 'proxy'}, {mode: 'global', target: 'proxy'}, groups, true, true, t).dirty).toBe(false);
  expect(modeView({mode: 'rule'}, null, [], false, false, t).targetText).toBe('—');
  expect(modeView({mode: 'global', target: 'proxy'}, {mode: 'direct'}, groups, false, true, t)).toMatchObject({mode: 'global', target: 'proxy', dirty: false});
  const targetless = modeView({mode: 'rule'}, {mode: 'global', target: ''}, [], true, true, t);
  expect(targetless).toMatchObject({dirty: true, incomplete: true});
  expect(staged.incomplete).toBe(false);
});

it('localizes notice kinds and shortens UUIDs without changing event identity', () => {
  const event = {id: 'ready', event: 'stream.ready' as const, data: {instance_id: '8936fe2c-bbbd-4c16-8336-7a5eb3119589', observed_at: '2026-01-01T00:00:00Z'}};
  const [row] = noticeRows([event], t);
  expect(row.id).toBe(event.id);
  expect(row.summaryText).toContain(t('event.k.streamReady'));
  expect(row.summaryText).toContain('8936fe2c');
  expect(row.summaryText).not.toContain(event.data.instance_id);
  expect(interestingNotice(event)).toBe(true);
  expect(interestingNotice({id: 'runtime', event: 'runtime.updated', data: {...event.data, href: '/api/v1/runtime'}})).toBe(false);
});

it('selects duplicate node labels by ID and preserves independent health', () => {
  const {nodes} = nodeFixtures(0, true);
  const first = {...nodes.find(node => node.name === 'hk-01')!, id: 'provider-a/hk', name: 'HK', provider_id: 'provider-a'};
  const second = {...nodes.find(node => node.name === 'jp-01')!, id: 'provider-b/hk', name: 'HK', provider_id: 'provider-b'};
  const view = nodeView([first, second], second.id, t);
  expect(view.id).toBe(second.id);
  expect(view.tone).toBe('err');
  expect(nodeView([first, second], first.id, t).tone).toBe('ok');
  // A healthy node shows no status light; its latency already says so.
  expect(nodeView([first, second], first.id, t).status).toBeNull();
});

it('renders measured local traffic even without backend history', () => {
  expect(trafficState({down: [0], up: [null]}, false, false)).toBe('ready');
  expect(trafficState({down: [12], up: [1]}, true, true)).toBe('ready');
  expect(trafficState({down: [null], up: [null]}, false, false)).toBe('unavailable');
  expect(trafficState({down: [], up: []}, true, true)).toBe('empty');
});

it('distinguishes unsupported runtime from loading', () => {
  expect(activityView(undefined, t, false).status.text).toBe(t('act.modeUnavailable'));
  expect(activityView(undefined, t).status.text).toBe(t('ui.loading'));
});

it('reports a degraded or failed datapath in the status as Overview does, without its link', () => {
  expect(activityView(runtime, t, true, 'en', 'degraded').status).toEqual({
    tone: 'warn',
    text: t('ov.status.datapathDegraded', {status: t('lifecycle.running')})
  });
  expect(activityView(runtime, t, true, 'en', 'active').status).toEqual({tone: 'ok', text: t('lifecycle.running')});
});

it('says why Apply or the global target is disabled, and nothing when there is only nothing to apply or a change is being applied', () => {
  const view = {writable: true, incomplete: false, status: t('act.modeReadOnly')};
  expect(modeReasons(view, false, t)).toEqual({mode: null, global: null});
  expect(modeReasons({...view, incomplete: true}, false, t)).toEqual({mode: 'Global mode needs an outbound', global: null});
  // The mode card shows a read-only backend's status beside its switch; the global target repeats it.
  expect(modeReasons({...view, writable: false}, false, t)).toEqual({mode: null, global: 'Read-only'});
  expect(modeReasons(view, true, t)).toEqual({mode: null, global: null});
});

it('shows the CPU card as a percent of one core, dashed until the backend has two samples', () => {
  const cpu = (cpu_percent: number | null, locale = 'en') => activityView({...runtime, process: {...runtime.process, cpu_percent}}, t, true, locale).cpu;
  expect(cpu(null)).toBe('—');
  expect(cpu(0)).toBe('0.0%');
  expect(cpu(42.5)).toBe('42.5%');
  expect(cpu(180)).toBe('180.0%');
  expect(activityView(runtime, t).cpuHelp).toEqual({title: t('act.cpu'), text: t('act.cpuHelp')});
});

it('lists what the backend lacks to route through a proxy, each with the page that adds it, and nothing once it is there', () => {
  expect(setupNotices({noNodeSources: false, noRouting: false}, t)).toEqual([]);
  expect(setupNotices({noNodeSources: true, noRouting: true}, t)).toEqual([
    {id: 'setup:nodes', tone: 'info', kindText: 'Notice', summaryText: 'No subscriptions yet', action: {label: 'Add subscription', href: '#/nodes'}},
    {
      id: 'setup:routing',
      tone: 'info',
      kindText: 'Notice',
      summaryText: 'No routing rules configured',
      action: {label: 'Choose a routing mode', href: '#/rules?tab=list&view=simple'}
    }
  ]);
});
