import {expect, it} from 'vitest';
import {changesPanel, defaults, parseItems, parseLayout, restoredPanel} from './layout';
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
  expect(layout).toMatchObject({version: 3, collapsed: true, pinned: false});
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
  expect(defaults().items.map(item => item.id)).toEqual(['speed', 'memory', 'divider', 'mode']);
  const dividers = [{id: 'divider'}, {id: 'divider', instance: 'divider-2'}];
  expect(parseItems(dividers, 'panel')).toHaveLength(2);
  expect(parseItems(dividers, 'dashboard')).toEqual([]);
  // A layout saved before the divider loads as it was.
  const saved = {version: 3, items: [{id: 'speed', form: 'sparkline', size: 'medium'}], collapsed: false, pinned: false, visible: true};
  expect(parseLayout(saved)).toEqual(saved);
});
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
