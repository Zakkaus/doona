import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {coverageView, flowRecordsView, routingMapView, tileViews, treeGeometry, treeWindow} from './view';
import {routingTree, treeIndex, treeReach} from './map';

const t: Translator = (key, params) => translate('en', key, params);

it('suppresses full coverage and keeps exact dropped counts and partial scopes', async () => {
  const list = await createMockApi().flows();
  const coverage = Object.fromEntries(Object.keys(list.coverage).map(scope => [scope, 'full'])) as typeof list.coverage;
  expect(coverageView({coverage, dropped_records: null}, t, 'en')).toBeNull();
  const view = coverageView({coverage: {...coverage, userspace_tcp: 'partial', kernel_direct: 'none'}, dropped_records: '18446744073709551615'}, t, 'en')!;
  expect(view.dropped).toContain('18446744073709551615');
  expect(view.summary).toBe(t('flow.coverageSummary', {n: 2}));
  expect(view.detail).toContain(t('flow.userspaceTcp'));
  expect(view.detail).toContain(t('flow.partialVisibility'));
  expect(view.detail).toContain(t('flow.kernelDirect'));
  expect(view.detail).toContain(t('ui.none'));
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

it('preserves input identifiers that collide with translated enum values in every language', async () => {
  const api = createMockApi();
  const list = await api.flows();
  const detail = await api.flow(list.flows[0].id);
  const input = detail.trace.steps.find(step => step.stage === 'input')!;
  input.data.values = {...input.data.values, domain: 'cache', pname: 'drop', ingress: 'lan', domain_source: 'tls_sni'};
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
    const t: Translator = (key, params) => translate(lang, key, params);
    const fields = flowRecordsView([], detail, list, new Map(), false, t, lang).detail!.steps.find(step => step.id === input.seq)!.fields;
    expect(fields).toContainEqual([t('ui.domain'), 'cache']);
    expect(fields).toContainEqual([t('ui.process'), 'drop']);
    expect(fields).toContainEqual([t('conn.f.ingress'), t('flow.v.lan')]);
    expect(fields).toContainEqual([t('conn.f.domainSource'), t('flow.v.tlsSni')]);
  }
});

it('keeps native policy names distinct and falls back only when the native name is empty', async () => {
  const api = createMockApi();
  const groups = await api.groups();
  const group = {...groups[0], policy: {...groups[0].policy, kind: 'urltest' as const, native: 'min_avg10'}};
  const notes = (native: string) => tileViews(routingTree([], [{...group, policy: {...group.policy, native}}], [], []), t)[0].notes;
  expect(notes('min_avg10')).toContainEqual({text: 'min_avg10'});
  expect(notes('min_last_delay')).toContainEqual({text: 'min_last_delay'});
  expect(notes('')).toContainEqual({text: 'urltest'});
});

it('bounds each tree reveal while keeping layout, connector endpoints and branch reachability', async () => {
  const rule = (await createMockApi().rules()).rules[0];
  const tree = routingTree(
    [],
    [],
    [],
    Array.from({length: 4096}, (_, i) => ({...rule, rule_id: String(i), outbound: 'direct'}))
  );
  const shown = treeWindow(tree, 30);
  const view = treeGeometry(shown, 720, t);
  expect(view.placed.filter(tile => tile.view.stage === 'rule')).toHaveLength(30);
  expect(treeWindow(tree, 60).leaves.at(-1)?.id).toBe('rule:59');
  expect(view.placed.find(tile => tile.view.id === 'rule:0')?.style.top).toBe(0);
  expect(view.placed.find(tile => tile.view.id === 'rule:1')?.style.top).toBe(40);
  expect(view.placed.find(tile => tile.view.id === 'outbound:direct')?.style.top).toBe(580);
  expect(view.height).toBe(1192);
  expect(view.geometry).toHaveLength(30);
  const edge = view.geometry[0];
  expect(edge.path).toBe('M253.33333333333331,16 C281.3333333333333,16 281.3333333333333,596 309.3333333333333,596');
  expect(treeGeometry(shown, 390, t).width).toBe(720);
  const reached = treeReach(treeIndex(tree), 'rule:0');
  expect([...reached.items]).toEqual(['rule:0', 'outbound:direct']);
  expect([...reached.edges]).toEqual([tree.links[0]]);
});
