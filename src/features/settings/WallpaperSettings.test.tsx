import {hookHarness} from '../../store/testHelpers';
import {expect, it, vi} from 'vitest';
import {FileButton} from '../../ui/FileButton';
import {setWallpaper} from '../../shell/wallpaper';
import {WallpaperSettings} from './WallpaperSettings';

const image = vi.hoisted(() => ({finish: (_: Blob) => undefined as void}));
vi.mock('react', async original => ({...(await original<typeof import('react')>()), ...hookHarness.hooks, useId: () => 'id'}));
vi.mock('../../i18n', () => ({useT: () => (key: string) => key}));
vi.mock('../../ui/ui', () => ({Button: () => null, InlineAlert: () => null, Switch: () => null}));
vi.mock('../../ui/FileButton', () => ({FileButton: () => null}));
vi.mock('../../ui/Slider', () => ({Slider: () => null}));
vi.mock('../../ui/WallpaperThumb', () => ({WallpaperThumb: () => null}));
vi.mock('../../shell/preferences', () => ({MAX_BLUR: 1}));
vi.mock('../../shell/wallpaper', () => ({
  DEFAULT_DIM: 0.6,
  MAX_DIM: 0.6,
  setWallpaper: vi.fn(),
  useWallpaper: () => ({wallpaper: null, stored: true}),
  wallpaperState: () => ({wallpaper: null})
}));
vi.mock('./wallpaperImage', () => ({
  prepareWallpaper: () => new Promise<Blob>(resolve => (image.finish = resolve)),
  WallpaperError: class extends Error {}
}));

type Element = {type: unknown; props: Record<string, unknown> & {children?: unknown}};
const find = (node: unknown, type: unknown): Element | undefined => {
  if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean);
  if (!node || typeof node !== 'object') return undefined;
  const element = node as Element;
  return element.type === type ? element : find(element.props.children, type);
};

it('offers the image choice again after a hidden page drops the image being prepared', async () => {
  hookHarness.reset();
  const choose = () => find(hookHarness.render(WallpaperSettings), FileButton)!.props;
  choose();
  hookHarness.runEffects();
  (choose().onSelect as (files: unknown) => void)([new File(['image'], 'image.png')]);
  expect(choose().isPending).toBe(true);
  // A hidden <Activity> runs the effect cleanups and keeps the state.
  hookHarness.unmount();
  image.finish(new Blob(['image']));
  await new Promise(resolve => setTimeout(resolve));
  choose();
  hookHarness.runEffects();
  expect(choose().isPending).toBe(false);
  expect(setWallpaper).not.toHaveBeenCalled();
});
