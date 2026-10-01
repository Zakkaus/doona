import type {Key, Rewording} from '../i18n';

// The one list of palettes, in menu order. The type, the appearance menu, the stored-value check and the first-paint
// script (vite.config.ts injects the ids into tools/stamp.js) all read it. An id is `family/flavour`, the two data
// attributes src/ui/styles/palettes/<family>.css keys on. Each entry pairs the light variant with a dark one; the
// description names both with their official variant names, and consecutive entries with the same group share a menu
// section. An optional `words` map has the translator read the palette's own key in place of a catalogue key while the
// palette is on.
export const palettes = [
  {id: 'rose-pine/main', group: 'palette.rosePine', label: 'palette.rosePine', desc: 'palette.dawnMain'},
  {id: 'rose-pine/moon', group: 'palette.rosePine', label: 'palette.moon', desc: 'palette.dawnMoon'},
  {id: 'catppuccin/frappe', group: 'palette.catppuccin', label: 'palette.frappe', desc: 'palette.latteFrappe'},
  {id: 'catppuccin/macchiato', group: 'palette.catppuccin', label: 'palette.macchiato', desc: 'palette.latteMacchiato'},
  {id: 'catppuccin/mocha', group: 'palette.catppuccin', label: 'palette.mocha', desc: 'palette.latteMocha'},
  {id: 'nord/nord', group: 'palette.nord', label: 'palette.nord', desc: 'palette.nordVariants'},
  {id: 'kary/kary', group: 'palette.kary', label: 'palette.kary', desc: 'palette.karyVariants'},
  {id: 'antd/antd', group: 'palette.antd', label: 'palette.antd', desc: 'palette.defaultDark'},
  {id: 'arco/arco', group: 'palette.bytedance', label: 'palette.arco', desc: 'palette.lightDark'},
  {id: 'semi/semi', group: 'palette.bytedance', label: 'palette.semi', desc: 'palette.lightDark'},
  {id: 'glass/glass', group: 'palette.glassName', label: 'palette.glassName', desc: 'palette.glass'},
  {
    id: 'qiangguo/qiangguo',
    group: 'palette.qiangguo',
    label: 'palette.qiangguo',
    desc: 'palette.qiangguoModes',
    words: {
      'act.good': 'palette.qiangguoGood',
      'lifecycle.running': 'palette.qiangguoGood',
      'act.unavailable': 'palette.qiangguoBad',
      'lifecycle.degraded': 'palette.qiangguoBad',
      'theme.light': 'palette.qiangguoLight',
      'theme.dark': 'palette.qiangguoDark'
    }
  }
] as const satisfies ReadonlyArray<{id: `${string}/${string}`; group: Key; label: Key; desc: Key; words?: Rewording}>;

export type PaletteId = (typeof palettes)[number]['id'];
export const DEFAULT_PALETTE: PaletteId = 'rose-pine/moon';

const ids: ReadonlySet<string> = new Set(palettes.map(palette => palette.id));
export function isPaletteId(value: string | null): value is PaletteId {
  return value !== null && ids.has(value);
}
export function paletteWords(id: PaletteId): Rewording | undefined {
  const palette = palettes.find(palette => palette.id === id)!;
  return 'words' in palette ? palette.words : undefined;
}
