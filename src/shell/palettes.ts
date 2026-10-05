import type {Key, Rewording} from '../i18n';

// The one list of palettes, in menu order. The type, the appearance menu, the stored-value check and the first-paint
// script (vite.config.ts injects the ids into tools/stamp.js) all read it. An id is `family/flavour`, the two data
// attributes src/ui/styles/palettes/<family>.css keys on. Each entry pairs the light variant with a dark one;
// consecutive entries with the same group share a menu section; the palettes alone in their family close the list under Other. An optional `words` map has the translator read the palette's own key in place of a catalogue key while the
// palette is on.
export const palettes = [
  {id: 'rose-pine/main', group: 'palette.rosePine', label: 'palette.rosePine'},
  {id: 'rose-pine/moon', group: 'palette.rosePine', label: 'palette.moon'},
  {id: 'catppuccin/frappe', group: 'palette.catppuccin', label: 'palette.frappe'},
  {id: 'catppuccin/macchiato', group: 'palette.catppuccin', label: 'palette.macchiato'},
  {id: 'catppuccin/mocha', group: 'palette.catppuccin', label: 'palette.mocha'},
  {id: 'arco/arco', group: 'palette.bytedance', label: 'palette.arco'},
  {id: 'semi/semi', group: 'palette.bytedance', label: 'palette.semi'},
  {id: 'glass/glass', group: 'palette.glassName', label: 'palette.liquid', desc: 'palette.chromiumOnly'},
  {id: 'glass/clear', group: 'palette.glassName', label: 'palette.glassName'},
  {id: 'glass/frosted', group: 'palette.glassName', label: 'palette.frosted'},
  {id: 'glass/tinted', group: 'palette.glassName', label: 'palette.tinted'},
  {id: 'nord/nord', group: 'palette.other', label: 'palette.nord'},
  {id: 'kary/kary', group: 'palette.other', label: 'palette.kary'},
  {id: 'antd/antd', group: 'palette.other', label: 'palette.antd'},
  {
    id: 'qiangguo/qiangguo',
    group: 'palette.other',
    label: 'palette.qiangguo',
    words: {
      'lifecycle.running': 'palette.qiangguoGood',
      'ui.unavailable': 'palette.qiangguoBad',
      'lifecycle.degraded': 'palette.qiangguoBad',
      'theme.light': 'palette.qiangguoLight',
      'theme.dark': 'palette.qiangguoDark'
    }
  }
] as const satisfies ReadonlyArray<{id: `${string}/${string}`; group: Key; label: Key; desc?: Key; words?: Rewording}>;

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
