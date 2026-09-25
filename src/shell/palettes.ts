import type {Key} from '../i18n';

// The one list of palettes, in menu order. The type, the appearance menu, the stored-value check and the first-paint
// script (vite.config.ts injects the ids into tools/stamp.js) all read it. An id is `family/flavour`, the two data
// attributes palettes.css keys on. Each entry pairs the light variant with a dark one; the description names both with
// their official variant names, and consecutive entries with the same group share a menu section.
export const palettes = [
  {id: 'rose-pine/main', group: 'palette.rosePine', label: 'palette.rosePine', desc: 'palette.dawnMain'},
  {id: 'rose-pine/moon', group: 'palette.rosePine', label: 'palette.moon', desc: 'palette.dawnMoon'},
  {id: 'catppuccin/frappe', group: 'palette.catppuccin', label: 'palette.frappe', desc: 'palette.latteFrappe'},
  {id: 'catppuccin/macchiato', group: 'palette.catppuccin', label: 'palette.macchiato', desc: 'palette.latteMacchiato'},
  {id: 'catppuccin/mocha', group: 'palette.catppuccin', label: 'palette.mocha', desc: 'palette.latteMocha'},
  {id: 'nord/nord', group: 'palette.nord', label: 'palette.nord', desc: 'palette.nordVariants'},
  {id: 'kary/kary', group: 'palette.kary', label: 'palette.kary', desc: 'palette.lightDark'},
  {id: 'antd/antd', group: 'palette.antd', label: 'palette.antd', desc: 'palette.defaultDark'},
  {id: 'arco/arco', group: 'palette.bytedance', label: 'palette.arco', desc: 'palette.lightDark'},
  {id: 'semi/semi', group: 'palette.bytedance', label: 'palette.semi', desc: 'palette.lightDark'},
  {id: 'glass/glass', group: 'palette.glassName', label: 'palette.glassName', desc: 'palette.glass'}
] as const satisfies ReadonlyArray<{id: `${string}/${string}`; group: Key; label: Key; desc: Key}>;

export type PaletteId = (typeof palettes)[number]['id'];
export const DEFAULT_PALETTE: PaletteId = 'rose-pine/moon';

const ids: ReadonlySet<string> = new Set(palettes.map(palette => palette.id));
export function isPaletteId(value: string | null): value is PaletteId {
  return value !== null && ids.has(value);
}
