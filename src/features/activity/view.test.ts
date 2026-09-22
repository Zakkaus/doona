import {expect, it} from 'vitest';
import {connections, nodeFixtures, runtime, runtimeMemory, runtimeOutbounds} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {activityOutbounds, activityRanking, activityView, modeView, nodeView, noticeRows, trafficState} from './view';
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
  expect(model.connections).toBe(0);
  expect(model.memoryBadge?.tone).toBe('err');
  expect(activityOutbounds(runtimeOutbounds, 'en-US', colors, t).rows.find(row => row.name === t('ui.block'))?.color).toBe('red');
  const ranking = activityRanking(connections, 'dev', colors, t);
  expect(ranking[0].pct).toBeGreaterThan(ranking[1].pct);
});

it('chooses measured nodes and preserves an explicitly selected unavailable node', () => {
  const {nodes} = nodeFixtures(0);
  expect(nodeView(nodes, '', t).name).toBe('hk-01');
  const unavailable = nodeView(nodes, 'jp-01', t);
  expect(unavailable.tone).toBe('err');
  expect(unavailable.latency).toBe('—');
  expect(nodeView([], '', t).tone).toBe('muted');
});

it('stages global targets without changing the current mode and detects an unchanged selection', () => {
  const {groups} = nodeFixtures(0);
  const staged = modeView({mode: 'rule'}, {mode: 'global', target: 'resilient'}, groups, true, true, t);
  expect(staged).toMatchObject({mode: 'global', target: 'resilient', dirty: true});
  expect(modeView({mode: 'global', target: 'proxy'}, {mode: 'global', target: 'proxy'}, groups, true, true, t).dirty).toBe(false);
  expect(modeView({mode: 'rule'}, null, [], false, false, t).targetText).toBe('—');
});

it('prepares notice summaries without discarding event identity', () => {
  const rows = noticeRows([{id: 'ready', event: 'stream.ready', data: {instance_id: 'instance', observed_at: '2026-01-01T00:00:00Z'}}], t);
  expect(rows[0]).toMatchObject({id: 'ready', tone: 'info'});
  expect(rows[0].summaryText).toContain('stream.ready');
  expect(rows[0].summaryText).toContain('instance');
});

it('selects duplicate node labels by ID and preserves independent health', () => {
  const {nodes} = nodeFixtures(0);
  const first = {...nodes.find(node => node.name === 'hk-01')!, id: 'provider-a/hk', name: 'HK', provider_id: 'provider-a'};
  const second = {...nodes.find(node => node.name === 'jp-01')!, id: 'provider-b/hk', name: 'HK', provider_id: 'provider-b'};
  const view = nodeView([first, second], second.id, t);
  expect(view.id).toBe(second.id);
  expect(view.tone).toBe('err');
  expect(view.menu.items.map(item => item.id)).toEqual([first.id, second.id]);
  expect(new Set(view.menu.items.map(item => item.label)).size).toBe(2);
  expect(nodeView([first, second], first.id, t).tone).toBe('ok');
});

it('renders measured local traffic even without backend history', () => {
  expect(trafficState({down: [0], up: [null]}, false, false)).toBe('ready');
  expect(trafficState({down: [12], up: [1]}, true, true)).toBe('ready');
  expect(trafficState({down: [null], up: [null]}, false, false)).toBe('unavailable');
  expect(trafficState({down: [], up: []}, true, true)).toBe('empty');
});
