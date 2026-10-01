import {afterEach, expect, it, vi} from 'vitest';
import {defaults} from './layout';
afterEach(() => vi.unstubAllGlobals());
it('merges a host patch with another tab’s saved items even before its storage event', async () => {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)});
  const {readLayout, saveLayout} = await import('./settings');
  readLayout();
  values.set('doona-widgets', JSON.stringify({...defaults(), items: []}));
  saveLayout(previous => ({...previous, collapsed: true}));
  expect(readLayout()).toMatchObject({items: [], collapsed: true});
});
it('retains edits in memory when browser storage is blocked', async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    }
  });
  const {readLayout, saveLayout} = await import('./settings');
  saveLayout(previous => ({...previous, visible: false}));
  expect(readLayout().visible).toBe(false);
});

it('keeps session edits when reads work but writes exceed the browser quota', async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', {
    getItem: () => JSON.stringify(defaults()),
    setItem: () => {
      throw new Error('quota');
    }
  });
  const {readLayout, saveLayout} = await import('./settings');
  saveLayout(previous => ({...previous, visible: false}));
  saveLayout(previous => ({...previous, collapsed: true}));
  expect(readLayout()).toMatchObject({visible: false, collapsed: true});
});
