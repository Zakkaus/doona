import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {coverageView, flowRecordsView, routingMapView, tileViews} from './view';
import {routingTree} from './map';

const t: Translator = (key, params) => translate('en', key, params);

it('suppresses full coverage and keeps exact dropped counts and partial scopes', async () => {
  const list = await createMockApi().flows();
  const coverage = Object.fromEntries(Object.keys(list.coverage).map(scope => [scope, 'full'])) as typeof list.coverage;
  expect(coverageView({coverage, dropped_records: null}, t, 'en')).toBeNull();
  const view = coverageView({coverage: {...coverage, userspace_tcp: 'partial'}, dropped_records: '18446744073709551615'}, t, 'en')!;
  expect(view.dropped).toContain('18446744073709551615');
  expect(view.summary).toBe(t('flow.coverageSummary', {n: 1}));
  expect(view.detail).toContain(t('flow.userspaceTcp'));
  expect(view.detail).toContain(t('flow.partialVisibility'));
});

it('distinguishes map readiness and supplies the pinned flow count', () => {
  const empty = routingTree([], [], [], []);
  expect(routingMapView(empty, false, false, null, 0, t).state).toBe('loading');
  expect(routingMapView(empty, false, true, null, 0, t).state).toBe('error');
  expect(routingMapView(empty, true, false, null, 0, t).state).toBe('empty');
  expect(routingMapView(empty, true, false, 'outbound:direct', 4, t).pinLabel).toBe(t('flow.viewPinned', {n: 4}));
});

it('prepares flow targets, sorted trace steps and rule seeds without losing IPv6', async () => {
  const api = createMockApi();
  const list = await api.flows();
  const detail = await api.flow(list.flows[0].id);
  detail.input = {...detail.input, domain: null, dst: '[2001:db8::5]:443'};
  detail.trace.steps.reverse();
  const view = flowRecordsView([{...list.flows[0], input: undefined}], detail, list, new Map(), true, t, 'en');
  expect(view.rows[0].target).toBe(list.flows[0].id);
  expect(view.detail!.seedHref).toBe('#/rules?tab=list&add=dip%3A2001%3Adb8%3A%3A5');
  const inputStep = detail.trace.steps.find(step => step.stage === 'input')!;
  expect(view.detail!.steps.map(step => step.id)).toEqual(detail.trace.steps.map(step => step.seq).sort((a, b) => a - b));
  expect(view.detail!.steps.find(step => step.stage === t('flow.stage.input'))?.fields).toContainEqual([t('conn.f.dst'), inputStep.data.values.dst]);
  expect(flowRecordsView([], detail, undefined, new Map(), false, t, 'en').detail!.seedHref).toBeNull();
  expect(flowRecordsView([], undefined, undefined, new Map(), false, t, 'en').detail).toBeNull();
});

it('prepares tile labels with configured destinations, nested policies and unknown nodes', async () => {
  const api = createMockApi();
  const [rules, groups, nodes] = await Promise.all([api.rules(), api.groups(), api.nodes({limit: 1000})]);
  const tree = routingTree([], groups, nodes.nodes, rules.rules);
  const tiles = tileViews(tree, t);
  const rule = rules.rules.find(rule => rule.outbound === 'block')!;
  const tile = tiles.find(tile => tile.id === 'rule:' + rule.rule_id)!;
  expect(tile.label).toContain('→ ' + t('ui.block'));
  expect(tile.name).toBe(rule.expression);
  const map = routingMapView(tree, true, false, null, 0, t);
  expect(map.state).toBe('ready');
});
