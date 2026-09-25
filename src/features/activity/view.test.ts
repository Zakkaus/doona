import {expect, it} from 'vitest';
import {connections, nodeFixtures, runtime, runtimeMemory, runtimeOutbounds} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {menuViews} from '../shared/nodeMenu';
import {activityOutbounds, activityRanking, activityView, interestingNotice, modeView, nodeView, noticeRows, trafficState} from './view';
const t: Translator = (key, params) => translate('en', key, params);
const colors = {cat: ['blue', 'green'], love: 'red'};

it('distinguishes missing metrics from zero and keeps block traffic separate from named groups', () => {
  const missing = activityView(undefined, undefined, t);
  expect(missing.connections).toBe('—');
  expect(missing.memoryBadge).toBeNull();
  const model = activityView(
    {...runtime, traffic: {...runtime.traffic, connections: {tcp: 0, udp: 0, total: 0}}},
    {...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, current_bytes: '91', limit_bytes: '100'}},
    t
  );
  expect(model.connections).toBe('0');
  expect(model.memoryBadge?.tone).toBe('err');
  expect(activityOutbounds(runtimeOutbounds, 'en-US', colors, t).rows.find(row => row.name === t('ui.block'))?.color).toBe('red');
  const ranking = activityRanking(connections, 'dev', colors, 'en', t);
  expect(ranking[0].pct).toBeGreaterThan(ranking[1].pct);
});

it('chooses measured nodes and preserves an explicitly selected unavailable node', () => {
  const {nodes} = nodeFixtures(0);
  expect(nodeView(nodes, '', t).name).toBe('hk-01');
  const unavailable = nodeView(nodes, 'jp-01', t);
  expect(unavailable.tone).toBe('err');
  expect(unavailable.latency).toBe('—');
  expect(unavailable.status).toBe(t('act.unavailable'));
  expect(unavailable.healthError).toBe(nodes.find(node => node.id === 'jp-01')?.health[0].error);
  expect(nodeView([], '', t).tone).toBe('muted');
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
  const {nodes} = nodeFixtures(0);
  const first = {...nodes.find(node => node.name === 'hk-01')!, id: 'provider-a/hk', name: 'HK', provider_id: 'provider-a'};
  const second = {...nodes.find(node => node.name === 'jp-01')!, id: 'provider-b/hk', name: 'HK', provider_id: 'provider-b'};
  const view = nodeView([first, second], second.id, t);
  expect(view.id).toBe(second.id);
  expect(view.tone).toBe('err');
  const menu = menuViews(view.options, t);
  expect(menu.items.map(item => item.id)).toEqual([first.id, second.id]);
  expect(new Set(menu.items.map(item => item.label)).size).toBe(2);
  expect(nodeView([first, second], first.id, t).tone).toBe('ok');
});

it('renders measured local traffic even without backend history', () => {
  expect(trafficState({down: [0], up: [null]}, false, false)).toBe('ready');
  expect(trafficState({down: [12], up: [1]}, true, true)).toBe('ready');
  expect(trafficState({down: [null], up: [null]}, false, false)).toBe('unavailable');
  expect(trafficState({down: [], up: []}, true, true)).toBe('empty');
});

it('distinguishes unsupported runtime from loading without hiding independent memory metrics', () => {
  const view = activityView(undefined, runtimeMemory, t, false);
  expect(view.status.text).toBe(t('act.modeUnavailable'));
  expect(view.rss).not.toBe('—');
  expect(activityView(undefined, undefined, t).status.text).toBe(t('ui.loading'));
});
