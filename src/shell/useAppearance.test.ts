import {afterEach, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {readSettings, type Scheme} from './preferences';
import {loadGlass, useAppearance} from './useAppearance';

const media = vi.hoisted(() => ({dark: false}));
vi.mock('../ui/hooks', () => ({useMediaQuery: () => media.dark, withCrossfade: (change: () => void) => change()}));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['system', false, 'dark'],
  ['system', true, 'light'],
  ['light', false, 'system'],
  ['light', true, 'system'],
  ['dark', false, 'system'],
  ['dark', true, 'system']
] as const)('toggles %s with system dark=%s to %s', (scheme, systemDark, expected) => {
  media.dark = systemDark;
  const stored = new Map<string, string>([['doona-scheme', scheme]]);
  const storage = {getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: vi.fn()};
  vi.stubGlobal('localStorage', storage);
  let appearance!: ReturnType<typeof useAppearance>;
  function Probe() {
    appearance = useAppearance(readSettings(storage));
    return null;
  }
  const render = () => renderToString(createElement(Probe));
  render();
  expect(appearance.dark).toBe(scheme === 'dark' || (scheme === 'system' && systemDark));
  appearance.toggle();
  expect(readSettings(storage).scheme).toBe(expected);
  render();
  expect(appearance.scheme).toBe(expected);
  const selected: Scheme = systemDark ? 'light' : 'dark';
  appearance.pickScheme(selected);
  render();
  expect(appearance.scheme).toBe(selected);
  expect(appearance.dark).toBe(!systemDark);
  appearance.toggle();
  expect(readSettings(storage).scheme).toBe('system');
});

// A Glass palette waits for its stylesheet; a palette picked meanwhile wins.
vi.mock('./glass', () => ({linkStylesheet: () => Promise.resolve()}));
it('applies a Glass palette once its stylesheet loads, unless another palette was picked meanwhile', async () => {
  const stored = new Map<string, string>();
  const storage = {getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: vi.fn()};
  vi.stubGlobal('localStorage', storage);
  let appearance!: ReturnType<typeof useAppearance>;
  function Probe() {
    appearance = useAppearance(readSettings(storage));
    return null;
  }
  const render = () => renderToString(createElement(Probe));
  render();
  appearance.pickPalette('glass/frosted');
  appearance.pickPalette('nord/nord');
  await loadGlass();
  render();
  expect(appearance.palette).toBe('nord/nord');
  expect(readSettings(storage).palette).toBe('nord/nord');
  appearance.pickPalette('glass/tinted');
  render();
  expect(appearance.palette).toBe('glass/tinted');
});
