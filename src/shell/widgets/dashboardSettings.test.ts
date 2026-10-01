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
