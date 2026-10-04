import {expect, it} from 'vitest';
import {changesPanel, defaults, parseItems, parseLayout, registry, restoredPanel, sizesFor, type WidgetId} from './layout';
import {moveWidget} from './instances';
it('defaults corrupt roots to a visible panel and preserves empty layouts', () => {
  for (const value of [null, {}, {version: 9, items: []}, {version: 1, items: 'bad'}]) expect(parseLayout(value)).toEqual(defaults());
  expect(defaults()).toMatchObject({visible: true, collapsed: false});
  expect(defaults()).not.toHaveProperty('size');
  expect(defaults()).not.toHaveProperty('docked');
  expect(parseLayout({version: 1, items: []}).items).toEqual([]);
});
it('migrates v1, drops version and malformed items before deduplication', () => {
  const layout = parseLayout({
    version: 1,
    floating: false,
    corner: 'top-start',
    position: 'top',
    collapsed: true,
    items: [
      {id: 'version'},
      {id: 'missing'},
      null,
      {id: 'speed', form: {}},
      {id: 'speed', form: 'chart'},
      {id: 'speed', form: 'text'},
      {id: 'group', group: 'backend-specific', form: 'text'},
      {id: 'ranking', by: 'domain', form: 'chart'}
    ]
  });
  expect(layout.items).toEqual([
    {id: 'speed', form: 'sparkline', size: 'medium'},
    {id: 'group', group: 'backend-specific', form: 'kv', size: 'medium'},
    {id: 'ranking', by: 'domain', form: 'ranked', size: 'medium'}
  ]);
  expect(layout).toMatchObject({version: 4, collapsed: true, pinned: true});
  for (const key of ['position', 'corner', 'floating', 'placement']) expect(layout).not.toHaveProperty(key);
  expect(parseLayout({...defaults(), pinned: true}).pinned).toBe(true);
});
it('normalizes widget sizes and drops the old placement', () => {
  const layout = parseLayout({
    version: 2,
    visible: false,
    placement: {edge: 'start', offset: 3},
    items: [
      {id: 'cpu', size: 'small', form: 'chart'},
      {id: 'mode', size: 'small'},
      {id: 'connections', size: 'large', form: 'text'}
    ]
  });
  expect(layout.items).toEqual([
    {id: 'cpu', size: 'small', form: 'kv'},
    {id: 'mode', size: 'medium', form: 'kv'},
    {id: 'connections', size: 'large', form: 'sparkline'}
  ]);
  expect(layout).not.toHaveProperty('placement');
  expect(layout.visible).toBe(false);
});
const metrics: WidgetId[] = ['speed', 'download', 'upload', 'connections', 'cpu', 'history', 'memory'];
it.each(metrics)('offers the panel %s only small and medium as a list of values', id => {
  expect(sizesFor(id, 'kv', 'panel')).toEqual(['small', 'medium']);
  expect(sizesFor(id, 'sparkline', 'panel')).toEqual(['small', 'medium', 'large']);
  expect(sizesFor(id, 'kv', 'dashboard')).toEqual(['small', 'medium', 'large']);
});
it.each([
  ['notices', 'kv'],
  ['ranking', 'kv'],
  ['outbounds', 'kv'],
  ['nodeLatency', 'dots'],
  ['mode', 'kv']
] as const)('keeps the sizes of the panel %s as a %s', (id, form) => {
  expect(sizesFor(id, form, 'panel')).toEqual(registry[id].sizes);
});
// Only the sizes each new widget's panel form fills: no single failure, no third row of node counts, no upstream rows
// in the key-value form.
it.each([
  ['outboundErrors', 'ranked', ['medium', 'large']],
  ['nodeAvailability', 'kv', ['small', 'medium']],
  ['dnsLatency', 'dots', ['small', 'medium', 'large']],
  ['dnsLatency', 'kv', ['small', 'medium']]
] as const)('offers the panel %s as a %s the sizes %j', (id, form, sizes) => {
  expect(sizesFor(id, form, 'panel')).toEqual(sizes);
  expect(defaults().items.map(item => item.id)).not.toContain(id);
});
it.each([
  ['speed', 'kv', 'medium'],
  ['memory', 'kv', 'medium'],
  ['cpu', 'text', 'medium'],
  ['speed', 'sparkline', 'large'],
  ['memory', 'sparkline', 'large'],
  ['notices', 'kv', 'large'],
  ['ranking', 'kv', 'large']
] as const)('reads a stored large %s as a %s as %s', (id, form, size) => {
  expect(parseLayout({version: 4, items: [{id, form, size: 'large'}]}).items[0]).toMatchObject({size});
});
it('keeps a stored large list of values on the dashboard', () => {
  expect(parseItems([{id: 'speed', form: 'kv', size: 'large'}], 'dashboard')[0]).toMatchObject({form: 'kv', size: 'large'});
});
it('moves only within bounds and preserves widget settings', () => {
  const items = defaults().items;
  expect(moveWidget(items, 'speed', -1)).toBe(items);
  expect(moveWidget(items, 'speed', 1)[1]).toBe(items[0]);
});

it.each(['panel', 'dashboard'] as const)('keeps only three stored instances of one widget on the %s', surface => {
  const items = [1, 2, 3, 4].map(n => ({id: 'speed', instance: `speed-${n}`, form: 'sparkline', size: 'medium'}));
  expect(parseItems(items, surface)).toEqual(items.slice(0, 3));
});

it.each([
  ['keeps a size within the limits', {width: 400, height: 500}, {width: 400, height: 500}],
  ['clamps a size to the limits', {width: 9999, height: 10}, {width: 640, height: 200}],
  ['drops a malformed size', {width: 'wide', height: 500}, undefined]
])('%s', (_name, size, expected) => expect(parseLayout({...defaults(), size}).size).toEqual(expected));

it.each([
  ['keeps a moved offset', {x: 120, y: 48}, {x: 120, y: 48}],
  ['keeps an offset non-negative', {x: -40, y: 12.4}, {x: 0, y: 12}],
  ['keeps an offset measured from the top', {x: 8, y: 20, top: true}, {x: 8, y: 20, top: true}],
  ['ignores a malformed top flag', {x: 8, y: 20, top: 'yes'}, {x: 8, y: 20}],
  ['drops a malformed offset', {x: 'left', y: 0}, undefined]
])('%s', (_name, offset, expected) => expect(parseLayout({...defaults(), offset}).offset).toEqual(expected));

it('offers the divider in the panel, several times, and never on the dashboard', () => {
  const dividers = [{id: 'divider'}, {id: 'divider', instance: 'divider-2'}];
  expect(parseItems(dividers, 'panel')).toHaveLength(2);
  expect(parseItems(dividers, 'dashboard')).toEqual([]);
  // A layout saved before the divider loads as it was.
  const saved = {version: 4, items: [{id: 'speed', form: 'sparkline', size: 'medium'}], collapsed: false, pinned: false, visible: true};
  expect(parseLayout(saved)).toEqual(saved);
});
it('defaults to a floating, pinned, open panel and pins a panel saved before version 4', () => {
  expect(defaults()).toMatchObject({version: 4, pinned: true, collapsed: false});
  expect(defaults()).not.toHaveProperty('docked');
  const placed = {docked: true, dockHeight: 300, size: {width: 400, height: 300}, offset: {x: 120, y: 48}};
  const migrated = parseLayout({...defaults(), ...placed, version: 3, pinned: false});
  expect(migrated).toMatchObject({version: 4, pinned: true, ...placed});
  expect(parseLayout({...defaults(), pinned: false}).pinned).toBe(false);
});
it('starts with the rates, memory and mode, and keeps a stored divider', () => {
  expect(defaults().items.map(item => item.id)).toEqual(['speed', 'memory', 'mode']);
  const stored = {
    ...defaults(),
    items: [
      {id: 'speed', form: 'sparkline', size: 'medium'},
      {id: 'divider', form: 'kv', size: 'medium'}
    ]
  };
  expect(parseLayout(stored).items).toEqual(stored.items);
});
it.each([
  ['hides the widget titles by default', {}, undefined],
  ['keeps them shown once chosen', {titles: true}, true],
  ['drops a value that is not true', {titles: 1}, undefined]
])('%s', (_name, value, titles) => expect(parseLayout({...defaults(), ...value}).titles).toBe(titles));
it.each([
  ['combines the rates charts by default', {}, undefined],
  ['keeps them split once chosen', {splitRates: true}, true],
  ['drops a value that is not true', {splitRates: 'yes'}, undefined]
])('%s', (_name, value, split) => expect(parseLayout({...defaults(), ...value}).splitRates).toBe(split));
it.each([
  ['keeps a docked panel docked', {docked: true}, true],
  ['floats a panel saved before docking existed', {}, undefined],
  ['drops the old floating flag', {floating: false}, undefined]
])('%s', (_name, value, docked) => expect(parseLayout({...defaults(), ...value}).docked).toBe(docked));
it.each([
  ['keeps hiding at an edge on', {edge: true}, true],
  ['keeps it off when absent', {}, undefined],
  ['drops a value that is not true', {edge: 'right'}, undefined]
])('%s', (_name, value, edge) => expect(parseLayout({...defaults(), ...value}).edge).toBe(edge));
it('restoring defaults floats a docked panel at its own size', () => {
  const saved = parseLayout({...defaults(), docked: true, dockHeight: 300.4, size: {width: 400, height: 300}, offset: {x: -20, y: -40}});
  expect(saved.docked).toBe(true);
  expect(saved.dockHeight).toBe(300);
  const restored = parseLayout(JSON.parse(JSON.stringify({...saved, ...restoredPanel})));
  for (const key of ['docked', 'dockHeight', 'size', 'offset']) expect(restored).not.toHaveProperty(key);
});
it.each([
  ['a panel at its default', {}, false],
  ['a moved panel', {offset: {x: -20, y: -40}}, true],
  ['a resized panel', {size: {width: 400, height: 300}}, true],
  ['a docked panel', {docked: true, dockHeight: 300}, true]
])('%s: restoring it changes the layout: %s', (_name, value, changes) => expect(changesPanel({...defaults(), ...value})).toBe(changes));
const idsWith = (has: (definition: (typeof registry)[WidgetId]) => unknown) => (Object.keys(registry) as WidgetId[]).filter(id => has(registry[id])).sort();
it.each([
  ['value tiles', idsWith(definition => definition.tile), ['download', 'upload', 'connections', 'cpu', 'latency']],
  [
    'charted',
    idsWith(definition => definition.forms.some(form => form === 'area' || form === 'sparkline')),
    ['speed', 'history', 'download', 'upload', 'connections', 'cpu', 'memory']
  ],
  [
    'lists',
    idsWith(definition => definition.rows),
    ['nodeLatency', 'ranking', 'policyGroups', 'sourceHealth', 'outbounds', 'connectionOutbounds', 'outboundErrors']
  ],
  ['rates', idsWith(definition => definition.rate), ['speed', 'history', 'download', 'upload']],
  ['untitled in the panel', idsWith(definition => definition.untitled), ['connections', 'cpu', 'global']],
  ['group choices', idsWith(definition => definition.groupChoice), ['nodeLatency', 'policyGroups', 'latency']]
])('derives the %s from the registry', (_name, derived, expected) => expect(derived).toEqual([...expected].sort()));
it('names the Automatic group as each widget did', () => {
  expect(registry.latency.groupChoice).toBe('act.groupFollow');
  expect([registry.nodeLatency.groupChoice, registry.policyGroups.groupChoice]).toEqual(['dashboard.allGroups', 'dashboard.allGroups']);
});
