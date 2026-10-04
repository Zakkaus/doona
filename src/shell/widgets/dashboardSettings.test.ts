import {afterEach, expect, it, vi} from 'vitest';
import {dashboardItems, mapWidgets} from './dashboardLayout';
afterEach(() => vi.unstubAllGlobals());
for (const failWrite of [false, true]) {
  it(`retains a saved layout and Automatic when legacy migration writes ${failWrite ? 'fail' : 'succeed'}`, async () => {
    vi.resetModules();
    const layout = {
      version: 2,
      sections: [
        {
          id: 'extensions',
          items: [
            {id: 'cpu', size: 'small', form: 'kv'},
            {id: 'latency', size: 'medium', form: 'kv'}
          ]
        }
      ]
    };
    const values = new Map([
      ['doona-dashboard', JSON.stringify(layout)],
      ['doona-activity-group', 'proxy']
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrite) throw new Error('quota');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key)
    });
    const {readDashboard} = await import('./dashboardSettings');
    expect(dashboardItems(readDashboard())).toEqual(layout.sections[0].items);
    expect(values.has('doona-activity-group')).toBe(failWrite);
  });
}
it('migrates the old page choice once when no dashboard was saved', async () => {
  vi.resetModules();
  const values = new Map([['doona-activity-group', 'proxy']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  const {readDashboard, saveDashboard} = await import('./dashboardSettings');
  expect(dashboardItems(readDashboard()).find(item => item.id === 'latency')?.group).toBe('proxy');
  saveDashboard(previous => mapWidgets(previous, item => ({...item, group: undefined})));
  expect(dashboardItems(readDashboard()).find(item => item.id === 'latency')?.group).toBeUndefined();
  expect(values.has('doona-activity-group')).toBe(false);
});
const cards = [
  {id: 'speed', size: 'medium', form: 'sparkline'},
  {id: 'speed', instance: 'speed-2', size: 'medium', form: 'area'},
  {id: 'cpu', size: 'medium', form: 'sparkline'}
];
const panel = (value: unknown) => JSON.stringify({version: 4, items: [{id: 'speed', form: 'sparkline', size: 'medium'}], pinned: true, splitRates: value});
it.each([
  ['splits the speed cards the former panel switch split', panel(true), [true, true, undefined], false],
  ['leaves them combined without the switch', panel(undefined), [undefined, undefined, undefined], true],
  ['leaves them combined for a switch that is not true', panel('yes'), [undefined, undefined, undefined], true],
  ['leaves them combined when the panel layout does not parse', '{', [undefined, undefined, undefined], true]
])('%s', async (_name, stored, split, kept) => {
  vi.resetModules();
  const values = new Map([
    ['doona-dashboard', JSON.stringify({version: 3, sections: [{id: 'extensions', items: cards}]})],
    ['doona-widgets', stored]
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  const {readDashboard} = await import('./dashboardSettings');
  expect(dashboardItems(readDashboard()).map(item => item.split)).toEqual(split);
  expect(values.get('doona-widgets') === stored).toBe(kept);
  // Once read, the panel keeps its own split and no longer holds the former switch, so the migration runs once.
  if (!kept) {
    expect(JSON.parse(values.get('doona-widgets')!)).toMatchObject({items: [{id: 'speed', split: true}]});
    expect(JSON.parse(values.get('doona-widgets')!)).not.toHaveProperty('splitRates');
    const {saveDashboard} = await import('./dashboardSettings');
    saveDashboard(previous => mapWidgets(previous, item => ({...item, split: undefined})));
    vi.resetModules();
    const {readDashboard: reread} = await import('./dashboardSettings');
    expect(dashboardItems(reread()).map(item => item.split)).toEqual([undefined, undefined, undefined]);
  }
});
