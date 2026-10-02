import {expect, it} from 'vitest';
import {createMockApi} from '../../../mock';
import {translate, type Translator} from '../../i18n';
import {flowDetailView, flowRecordsView, flowsTabQuery, flowsView, routingMapView, tileViews, treeGeometry, treeWindow} from './view';
import {routingTree, treeIndex, treeReach} from './map';

const t: Translator = (key, params) => translate('en', key, params);

it('distinguishes map readiness and supplies the pinned flow count', () => {
  const empty = routingTree([], [], [], undefined);
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
  const view = {...flowRecordsView([{...list.flows[0], input: undefined}], list, undefined, new Map(), t, 'en'), detail: flowDetailView(detail, t, 'en')};
  expect(view.rows[0].target).toBe(list.flows[0].id);
  expect(view.rows[0].seed).toMatchObject({domain: null, dip: null, sip: null});
  // Only a flow routed by the listed generation links to the listed rule; the others keep the recorded text alone.
  const routed = list.flows.find(flow => flow.rule_id && flow.rule_expression)!;
  const links = (rule_generation_id: string | null) =>
    flowRecordsView([{...routed, rule_generation_id}], list, routed.rule_generation_id!, new Map(), t, 'en').rows[0];
  expect(links(routed.rule_generation_id)).toMatchObject({ruleId: routed.rule_id, expression: routed.rule_expression});
  expect(links('older')).toMatchObject({ruleId: null, expression: routed.rule_expression});
  expect(links(null)).toMatchObject({ruleId: null, expression: routed.rule_expression});
  const ipv6 = flowRecordsView([{...detail, input: {...detail.input, src: '[2001:db8::12]:51234'}}], list, undefined, new Map(), t, 'en').rows[0];
  expect(ipv6.seed).toMatchObject({
    domain: null,
    dip: '2001:db8::5',
    sip: '2001:db8::12',
    outbound: detail.outbound,
    matched: detail.rule_id ? {id: detail.rule_id, expression: detail.rule_expression, generation: detail.rule_generation_id} : null
  });
  const inputStep = detail.trace.steps.find(step => step.stage === 'input')!;
  expect(view.detail!.steps.map(step => step.id)).toEqual(detail.trace.steps.map(step => step.seq).sort((a, b) => a - b));
  expect(view.detail!.steps.find(step => step.stage === t('flow.stage.input'))?.fields).toContainEqual([t('conn.f.dst'), inputStep.data.values.dst]);
  // The drawer repeats the node path and the rule that the list cuts short.
  const fields = flowDetailView(detail, t, 'en', {node: 'hk-01', path: 'Proxy → hk-01', expression: 'domain(geosite:cn)'})!.fields;
  expect(fields).toContainEqual([t('conn.node'), 'Proxy → hk-01']);
  expect(fields).toContainEqual([t('conn.rule'), 'domain(geosite:cn)']);
  expect(flowDetailView(undefined, t, 'en')).toBeNull();
  // A match the backend did not record is not vouched for.
  expect(flowRecordsView([{...detail, rule_id: 'r5', rule_source: 'unknown'}], list, undefined, new Map(), t, 'en').rows[0].seed.matched).toBeNull();
});

it('prepares tile labels with configured destinations, nested policies and unknown nodes', async () => {
  const api = createMockApi();
  const [rules, groups, nodes] = await Promise.all([api.rules(), api.groups(), api.nodes({limit: 1000})]);
  const tree = routingTree([], groups, nodes.nodes, rules);
  const tiles = tileViews(tree, t, 'en');
  const rule = rules.rules.find(rule => rule.outbound === 'block')!;
  const tile = tiles.find(tile => tile.id === 'rule:' + rule.rule_id)!;
  expect(tile.label).toContain('→ ' + t('ui.block'));
  expect(tile.name).toBe(rule.expression);
  tree.leaves[0].count = 12345;
  expect(tileViews(tree, t, 'en')[0].countText).toBe('12,345');
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
    const fields = flowDetailView(detail, t, lang)!.steps.find(step => step.id === input.seq)!.fields;
    expect(fields).toContainEqual([t('ui.domain'), 'cache']);
    expect(fields).toContainEqual([t('ui.process'), 'drop']);
    expect(fields).toContainEqual([t('conn.f.ingress'), t('flow.v.lan')]);
    expect(fields).toContainEqual([t('conn.f.domainSource'), t('flow.v.tlsSni')]);
  }
});

it('names a policy by what it does, whatever the native spelling', async () => {
  const api = createMockApi();
  const groups = await api.groups();
  const group = {...groups[0], policy: {...groups[0].policy, kind: 'urltest' as const, native: 'min_avg10'}};
  const notes = (native: string) => tileViews(routingTree([], [{...group, policy: {...group.policy, native}}], [], undefined), t, 'en')[0].notes;
  expect(notes('min_avg10')).toContainEqual({text: t('policy.kind.urltest')});
  expect(notes('min_last_delay')).toContainEqual({text: t('policy.kind.urltest')});
  expect(notes('min_moving_avg')).toContainEqual({text: t('policy.kind.urltest')});
  expect(notes('')).toContainEqual({text: t('policy.kind.urltest')});
});

it('bounds each tree reveal while keeping layout, connector endpoints and branch reachability', async () => {
  const rules = await createMockApi().rules();
  const tree = routingTree([], [], [], {...rules, rules: Array.from({length: 4096}, (_, i) => ({...rules.rules[0], rule_id: String(i), outbound: 'direct'}))});
  const shown = treeWindow(tree, 30);
  const view = treeGeometry(shown, 720, t, 'en');
  expect(view.placed.filter(tile => tile.view.stage === 'rule')).toHaveLength(30);
  expect(treeWindow(tree, 60).leaves.at(-1)?.id).toBe('rule:59');
  expect(view.placed.find(tile => tile.view.id === 'rule:0')?.style.top).toBe(0);
  expect(view.placed.find(tile => tile.view.id === 'rule:1')?.style.top).toBe(44);
  expect(view.placed.find(tile => tile.view.id === 'outbound:direct')?.style.top).toBe(638);
  expect(view.height).toBe(1312);
  expect(view.geometry).toHaveLength(30);
  const edge = view.geometry[0];
  expect(edge.path).toBe('M253.33333333333331,18 C281.3333333333333,18 281.3333333333333,656 309.3333333333333,656');
  expect(treeGeometry(shown, 390, t, 'en').width).toBe(720);
  const reached = treeReach(treeIndex(tree), 'rule:0');
  expect([...reached.items]).toEqual(['rule:0', 'outbound:direct']);
  expect([...reached.edges]).toEqual([tree.links[0]]);
});

it('names the groups leading to a node tile and leaves an unmeasured step without a unit', async () => {
  const api = createMockApi();
  const [rules, groups, nodes, list] = await Promise.all([api.rules(), api.groups(), api.nodes({limit: 1000}), api.flows()]);
  const tree = routingTree(list.flows, groups, nodes.nodes, rules);
  const tiles = tileViews(tree, t, 'en');
  const link = tree.links.find(link => link.target.startsWith('node:'))!;
  const source = tiles.find(tile => tile.id === link.source)!;
  expect(tiles.find(tile => tile.id === link.target)!.label).toContain('← ' + source.name);
  const detail = await api.flow(list.flows[0].id);
  detail.trace.steps = detail.trace.steps.map(step => ({...step, elapsed_us: null}));
  expect(flowDetailView(detail, t, 'en')!.steps.every(step => step.elapsed === '—')).toBe(true);
});

it('shows a connection state from a newer backend as sent', async () => {
  const api = createMockApi();
  const detail = await api.flow((await api.flows()).flows[0].id);
  const step = detail.trace.steps.find(step => step.stage === 'connection')!;
  step.data = {...step.data, state: 'closing' as typeof step.data.state};
  const view = flowDetailView(detail, t, 'en')!;
  expect(view.steps.find(row => row.id === step.seq)!.fields).toContainEqual([t('ui.state'), 'closing']);
});

it('opens on the map and offers the records beside it', async () => {
  const {resources} = await createMockApi().capabilities();
  const view = flowsView(resources, '', t);
  expect(view.tabs.map(tab => tab.label)).toEqual(['Map', 'Records']);
  expect(view).toMatchObject({tab: 'map', fallback: 'map'});
  expect(flowsView(resources, 'tab=records', t).tab).toBe('records');
  expect(flowsView(undefined, '', t).fallback).toBeNull();
  resources.flows.available = false;
  expect(flowsView(resources, 'tab=records', t).tabs).toEqual([]);
});

it('carries the pinned path between tabs and leaves the state of the other tab behind', () => {
  expect(flowsTabQuery('by=client&path=a', 'records', 'map')).toBe('path=a&tab=records');
  // The map stays out of the address, so a record selection left behind would read as an old records link.
  expect(flowsTabQuery('tab=records&id=f&connection_id=1&path=a', 'map', 'map')).toBe('path=a');
});
