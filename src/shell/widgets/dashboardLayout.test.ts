import {expect, it} from 'vitest';
import {dashboardDefaults, dashboardItems, footprint, mainCard, parseDashboard} from './dashboardLayout';
import {placeWidget, removeWidget, stepWidget} from './dashboardEdit';
import {defaultWidget, instanceId, parseItems, registry, formsFor, widthsFor} from './layout';
import {addInstance, moveWidget} from './instances';
import {heightKind, legacyRows, presetsFor, sizeAxes, withPreset, withWidth} from './dashboardSizing';
const ids = (layout: ReturnType<typeof dashboardDefaults>) => layout.sections.map(section => section.items.map(instanceId));
const main = [
  ['mode', 'global', 'status'],
  ['download', 'upload', 'connections', 'latency', 'cpu'],
  ['history', 'outbounds'],
  ['ranking', 'memory', 'notices']
];
it("defaults to origin/main's sections card for card, then the extensions, and round trips", () => {
  const defaults = dashboardDefaults();
  expect(ids(defaults).slice(0, 4)).toEqual(main);
  expect(ids(defaults)[4]).toEqual(['nodeLatency', 'connectionOutbounds', 'dnsAnswers', 'policyGroups']);
  expect(parseDashboard(JSON.parse(JSON.stringify(defaults)))).toEqual(defaults);
  expect(dashboardItems(defaults).filter(mainCard)).toHaveLength(13);
  expect(parseDashboard({version: 2, sections: []}).sections.every(section => !section.items.length)).toBe(true);
  expect(parseDashboard({version: 9})).toEqual(defaults);
});
it.each([
  ['an untouched list into main sections', true, main],
  ['a rearranged list in its order into extensions', false, [[], [], [], [], main.flat().reverse()]]
] as const)('migrates version 1: %s', (_name, original, expected) => {
  const items = dashboardItems(dashboardDefaults()).slice(0, 13);
  const parsed = parseDashboard({version: 1, original, items: original ? items : [...items].reverse()});
  expect(ids(parsed).slice(0, expected.length)).toEqual(expected);
});
it('keeps footprints on the first instance', () => {
  expect(footprint(defaultWidget('cpu'))).toBe('end');
  expect(footprint({...defaultWidget('cpu'), instance: 'b'})).toBeUndefined();
});
it.each([
  [
    'within a section, after a target',
    'download',
    {section: 'metrics', target: 'connections', after: true},
    ['upload', 'connections', 'download', 'latency', 'cpu']
  ],
  [
    'into another section, before a target',
    'memory',
    {section: 'metrics', target: 'upload'},
    ['download', 'memory', 'upload', 'connections', 'latency', 'cpu']
  ],
  ['onto itself as a no-op', 'cpu', {section: 'metrics', target: 'cpu'}, main[1]]
] as const)('places a card %s', (_name, id, place, metrics) => {
  const placed = placeWidget(dashboardDefaults(), id, place);
  expect(ids(placed)[1]).toEqual(metrics);
  expect(dashboardItems(placed)).toHaveLength(17);
});
it('steps across section edges and stops at the page ends', () => {
  const defaults = dashboardDefaults();
  expect(ids(stepWidget(defaults, 'status', 1)).slice(0, 2)).toEqual([
    ['mode', 'global'],
    ['status', ...main[1]]
  ]);
  expect(ids(stepWidget(defaults, 'mode', -1))).toEqual(ids(defaults));
  // Resizing one card writes only that card.
  const resized = {
    ...defaults,
    sections: defaults.sections.map(s => ({...s, items: s.items.map(i => (i.id === 'download' ? {...i, size: 'large' as const} : i))}))
  };
  expect(
    dashboardItems(parseDashboard(resized))
      .filter(item => item.size !== 'medium')
      .map(instanceId)
  ).toEqual(['download', 'nodeLatency']);
});
it('keeps three independent instances across sections and rejects duplicate ids and invalid forms', () => {
  const items = ['a', 'b', 'c', 'd'].map((instance, index) => ({
    ...defaultWidget('nodeLatency'),
    instance,
    group: String(index),
    size: index === 1 ? 'wide' : 'small'
  }));
  const parsed = parseItems([items[0], {...items[0], group: 'duplicate'}, ...items.slice(1), {...defaultWidget('cpu'), form: 'donut'}], 'dashboard');
  expect(parsed.map(item => [instanceId(item), item.group])).toEqual([
    ['a', '0'],
    ['b', '1'],
    ['c', '2']
  ]);
  expect(addInstance(parsed, 'nodeLatency')).toBe(null);
  expect(moveWidget(parsed, 'c', -1).map(instanceId)).toEqual(['a', 'c', 'b']);
  expect(parseItems(items, 'panel').every(item => item.size !== 'wide')).toBe(true);
  const split = parseDashboard({
    version: 2,
    sections: [
      {id: 'quick', items: [items[0]]},
      {id: 'details', items: [items[0], items[1]]}
    ]
  });
  expect(ids(split)).toEqual([['a'], [], [], ['b'], []]);
});
it('declares compatible compact forms and sources for every module', () => {
  for (const id of Object.keys(registry) as Array<keyof typeof registry>)
    for (const form of formsFor(id, 'panel')) expect(formsFor(id, 'dashboard')).toContain(form);
  expect(formsFor('nodeLatency', 'dashboard')).toEqual(['dots', 'ranked']);
});

it('reads a version 2 layout unchanged, so every card stays Auto with its own rows', () => {
  const v2 = {...dashboardDefaults(), version: 2};
  const read = parseDashboard(JSON.parse(JSON.stringify(v2)));
  expect(read).toEqual(dashboardDefaults());
  expect(read.version).toBe(3);
  expect(dashboardItems(read).some(item => item.width || item.height || item.rows)).toBe(false);
});
it('keeps chosen widths, heights and rows when moved and read back', () => {
  const layout = parseDashboard({
    version: 3,
    sections: [
      {
        id: 'details',
        items: [
          {...defaultWidget('memory'), width: '1/2', height: 'tall'},
          {...defaultWidget('nodeLatency'), width: 'full', rows: 8}
        ]
      }
    ]
  });
  const moved = parseDashboard(JSON.parse(JSON.stringify(placeWidget(layout, 'memory', {section: 'metrics'}))));
  expect(dashboardItems(moved).find(item => item.id === 'memory')).toMatchObject({width: '1/2', height: 'tall'});
  expect(dashboardItems(moved).find(item => item.id === 'nodeLatency')).toMatchObject({width: 'full', rows: 8});
});
it.each([
  [{width: '1/4'}, 'memory', {width: '1/3'}],
  [{width: '1/3'}, 'nodeLatency', {width: '1/2'}],
  [{width: '1/4'}, 'cpu', {width: '1/4'}],
  [{width: '3/5'}, 'cpu', {width: undefined}],
  [{height: 'huge'}, 'memory', {height: undefined}],
  [{rows: 12}, 'nodeLatency', {rows: undefined}],
  [{rows: 5}, 'nodeLatency', {rows: 5}]
] as const)('reads %o on %s as %o', (fields, id, expected) => {
  const [item] = dashboardItems(parseDashboard({version: 3, sections: [{id: 'extensions', items: [{...defaultWidget(id), ...fields}]}]}));
  for (const [key, value] of Object.entries(expected)) expect(item[key as keyof typeof item]).toBe(value);
});
it.each([
  ['cpu', 'sparkline', true, 'chart'],
  ['latency', 'kv', true, 'chart'],
  ['memory', 'area', true, 'chart'],
  ['ranking', 'ranked', true, 'rows'],
  ['notices', 'kv', true, undefined],
  ['mode', 'kv', true, undefined],
  ['cpu', 'kv', false, undefined],
  ['speed', 'sparkline', false, 'chart'],
  ['dnsAnswers', 'donut', false, undefined],
  ['dnsAnswers', 'ranked', false, undefined],
  ['outbounds', 'ranked', false, 'rows'],
  ['nodeLatency', 'dots', false, 'rows'],
  ['dnsLatency', 'dots', false, 'chart'],
  ['dnsLatency', 'kv', false, undefined]
] as const)('%s as %s (main %s) adjusts its %s', (id, form, main, kind) => {
  expect(heightKind({...defaultWidget(id), form}, main)).toBe(kind);
});
it.each([
  ['nodeLatency', 'small', false, 3],
  ['nodeLatency', 'medium', false, 6],
  ['nodeLatency', 'wide', false, 12],
  ['policyGroups', 'small', false, 1],
  ['ranking', 'large', false, 5],
  ['ranking', 'medium', true, 5],
  ['notices', 'medium', true, undefined],
  ['sourceHealth', 'medium', false, undefined],
  ['providerBudget', 'medium', false, undefined]
] as const)('%s at %s (main %s) keeps its earlier %s rows', (id, size, main, rows) => {
  expect(legacyRows({...defaultWidget(id), size}, main)).toBe(rows);
});
const every = ['1/5', '1/4', '1/3', '1/2', '2/3', 'full'];
const third = every.slice(2);
const chart = ['short', 'standard', 'tall'];
const steps = ['3', '5', '8'];
// Each card's widths, and its heights in its first dashboard form: only those its content fills.
it.each([
  ['speed', third, chart],
  ['traffic', ['1/3', '1/2'], []],
  ['connections', every, chart],
  ['memory', third, chart],
  ['cpu', every, chart],
  ['ranking', third, steps],
  ['outbounds', third, []],
  ['mode', third, []],
  ['global', third, []],
  ['group', ['1/3', '1/2', '2/3'], []],
  ['status', third, []],
  ['notices', third, []],
  ['download', every, chart],
  ['upload', every, chart],
  ['latency', every, chart],
  ['history', third, chart],
  ['nodeLatency', ['1/2', '2/3', 'full'], ['3', '5', 'auto', '8']],
  ['sourceHealth', third, [...steps, 'auto']],
  ['providerBudget', third, [...steps, 'auto']],
  ['connectionOutbounds', third, []],
  ['connectionNetworks', ['1/3', '1/2'], []],
  ['dnsAnswers', ['1/3', '1/2'], []],
  ['policyGroups', third, steps],
  ['outboundErrors', third, steps],
  ['nodeAvailability', ['1/5', '1/4', '1/3'], []],
  ['dnsLatency', ['1/3', '1/2', '2/3'], chart]
] as const)('offers %s the widths %j and the heights %j', (id, widths, heights) => {
  const axes = sizeAxes({id, form: formsFor(id, 'dashboard')[0], size: 'medium'}, registry[id].tile === true, (key: string) => key);
  expect(axes.width.options.map(option => option.value)).toEqual(['auto', ...widths]);
  expect(axes.height?.options.map(option => option.value) ?? []).toEqual(heights);
});
it('reads a stored width or row count a card no longer offers as the nearest one, and keeps the card', () => {
  const parsed = parseItems(
    [
      {id: 'traffic', form: 'kv', size: 'medium', width: 'full'},
      {id: 'group', form: 'kv', size: 'medium', width: 'full'},
      {id: 'dnsAnswers', form: 'ranked', size: 'medium', width: '2/3', rows: 8},
      {id: 'nodeLatency', form: 'ranked', size: 'medium', width: '1/4', rows: 8},
      {id: 'notices', form: 'kv', size: 'medium', rows: 5}
    ],
    'dashboard'
  );
  expect(parsed.map(({id, width, rows}) => [id, width, rows])).toEqual([
    ['traffic', '1/2', undefined],
    ['group', '2/3', undefined],
    ['dnsAnswers', '1/2', undefined],
    ['nodeLatency', '1/2', 8],
    ['notices', undefined, undefined]
  ]);
});
it("offers widths from the card's narrowest, Auto first, and its earlier row count beside the three steps", () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);
  expect(widthsFor('nodeLatency')).toEqual(['1/2', '2/3', 'full']);
  expect(widthsFor('cpu')).toEqual(['1/5', '1/4', '1/3', '1/2', '2/3', 'full']);
  expect(widthsFor('history')).toEqual(['1/3', '1/2', '2/3', 'full']);
  const axes = sizeAxes({...defaultWidget('nodeLatency'), size: 'wide'}, false, t as never);
  expect(axes.width.options.map(option => option.value)).toEqual(['auto', '1/2', '2/3', 'full']);
  expect(axes.height?.options.map(option => [option.value, option.label])).toEqual([
    ['3', 'dashboard.rows:{"n":3}'],
    ['5', 'dashboard.rows:{"n":5}'],
    ['8', 'dashboard.rows:{"n":8}'],
    ['auto', 'dashboard.rows:{"n":12}']
  ]);
  expect(axes.height?.value).toBe('auto');
  // The earlier count stays on offer after another is chosen, and choosing it clears the choice.
  const eight = axes.height!.set('8');
  expect(eight.rows).toBe(8);
  const again = sizeAxes(eight, false, t as never).height!;
  expect([again.value, again.options.map(option => option.value)]).toEqual(['8', ['3', '5', '8', 'auto']]);
  expect(again.set('auto').rows).toBeUndefined();
  // A list that had no limit offers every row as Auto, and reports it.
  const sources = sizeAxes(defaultWidget('sourceHealth'), false, t as never).height!;
  expect([sources.value, sources.options.at(-1)]).toEqual(['auto', {value: 'auto', label: 'dashboard.allRows'}]);
  // A list whose earlier count is a step has no separate Auto.
  expect(sizeAxes({...defaultWidget('ranking'), size: 'medium'}, true, t as never).height).toMatchObject({
    value: '5',
    options: [{value: '3'}, {value: '5'}, {value: '8'}]
  });
  expect(withWidth({...defaultWidget('cpu'), size: 'small'}, '1/2')).toMatchObject({width: '1/2', size: 'medium'});
  expect(withWidth({...defaultWidget('cpu'), size: 'large', width: '1/2'}, undefined)).toMatchObject({width: undefined, size: 'large'});
});

it('offers gallery presets from the narrowest width of a quarter or more, with a tall half where a card has a height', () => {
  const t = defaultWidget;
  expect(presetsFor(t('cpu'), true)).toEqual([{width: '1/4'}, {width: '1/2'}, {width: 'full'}, {width: '1/2', height: 'tall'}]);
  expect(presetsFor({...t('history'), form: 'area'}, true)).toEqual([{width: '1/3'}, {width: '1/2'}, {width: 'full'}, {width: '1/2', height: 'tall'}]);
  expect(presetsFor({...t('nodeLatency'), form: 'ranked'}, false)).toEqual([{width: '1/2'}, {width: 'full'}, {width: '1/2', rows: 8}]);
  expect(withPreset({...t('cpu'), size: 'small'}, {width: '1/2', height: 'tall'})).toMatchObject({width: '1/2', height: 'tall', size: 'medium'});
});

it('removes a card and puts it back at its place in the layout as it is by then, once', () => {
  const layout = dashboardDefaults();
  const {layout: removed, restore} = removeWidget(layout, 'upload');
  expect(dashboardItems(removed).some(item => item.id === 'upload')).toBe(false);
  const moved = stepWidget(removed, 'cpu', -1);
  const restored = restore(moved);
  expect(restored.sections.find(section => section.id === 'metrics')!.items.map(instanceId)).toEqual(['download', 'upload', 'connections', 'cpu', 'latency']);
  expect(restore(restored)).toBe(restored);
});
it('puts a removed card back only while its module is under its instance limit', () => {
  const cpu = (instance?: string) => ({...defaultWidget('cpu'), ...(instance ? {instance} : {})});
  const layout = {
    ...dashboardDefaults(),
    sections: dashboardDefaults().sections.map(section => (section.id === 'extensions' ? {...section, items: [cpu('b'), cpu('c')]} : section))
  };
  const {layout: removed, restore, restorable} = removeWidget(layout, 'b');
  expect(restorable(removed)).toBe(true);
  const added = addInstance(dashboardItems(removed), 'cpu')!;
  const full = {
    ...removed,
    sections: removed.sections.map(section => (section.id === 'extensions' ? {...section, items: [...section.items, added]} : section))
  };
  expect(restorable(full)).toBe(false);
  expect(restore(full)).toBe(full);
  expect(dashboardItems(full).filter(item => item.id === 'cpu')).toHaveLength(3);
});
