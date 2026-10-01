import {expect, it} from 'vitest';
import {dashboardDefaults, dashboardItems, footprint, mainCard, parseDashboard} from './dashboardLayout';
import {placeWidget, sizesFor, stepWidget} from './dashboardEdit';
import {defaultWidget, instanceId, parseItems, registry, formsFor} from './layout';
import {addInstance, moveWidget} from './instances';
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
it('keeps footprints on the first instance and sizes per section', () => {
  expect(footprint(defaultWidget('cpu'))).toBe('end');
  expect(footprint({...defaultWidget('cpu'), instance: 'b'})).toBeUndefined();
  expect(sizesFor('metrics', registry.cpu.sizes)).toEqual(['medium', 'large', 'wide']);
  expect(sizesFor('extensions', registry.cpu.sizes)).toEqual(['small', 'medium', 'large', 'wide']);
  expect(sizesFor('quick', registry.mode.sizes)).toEqual(['medium']);
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
