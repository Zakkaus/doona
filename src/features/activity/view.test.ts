import {expect, it} from 'vitest';
import {connections, nodeFixtures, runtime, runtimeMemory, runtimeOutbounds} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {activityView, modeView, nodeView, noticeRows} from './view';
const t: Translator = (key, params) => translate('en', key, params);
const colors = {cat: ['blue', 'green'], love: 'red'};

it('distinguishes missing metrics from zero and keeps block traffic separate from named groups', () => {
  const missing = activityView(undefined, undefined, undefined, undefined, 'dev', 'en-US', colors, t);
  expect(missing.connections).toBe('—');
  expect(missing.memoryBadge).toBeNull();
  const model = activityView(
    {...runtime, traffic: {...runtime.traffic, connections: {tcp: 0, udp: 0, total: 0}}},
    {...runtimeMemory, cgroup: {...runtimeMemory.cgroup!, current_bytes: '91', limit_bytes: '100'}},
    runtimeOutbounds,
    connections,
    'dev',
    'en-US',
    colors,
    t
  );
  expect(model.connections).toBe(0);
  expect(model.memoryBadge?.tone).toBe('err');
  expect(model.outbounds.rows.find(row => row.name === t('ui.block'))?.color).toBe('red');
  expect(model.ranking[0].pct).toBeGreaterThan(model.ranking[1].pct);
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
