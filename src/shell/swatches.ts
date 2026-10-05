import type {Key, Translator} from '../i18n';
import type {SwatchColours, SwatchProps} from '../ui/Swatch';
import type {PaletteId} from './palettes';
import type {PaletteSection} from './view';

// Each palette's light and dark variant as the pickers draw them, each one string of --rp-base, --rp-surface, --rp-text,
// --rp-accent and --rp-positive. The settings spec checks every entry against the computed tokens. Glass draws these
// over its wallpaper.
export const swatches: Record<PaletteId, readonly [light: SwatchColours, dark: SwatchColours]> = {
  'rose-pine/main': ['#faf4ed #fffaf3 #464261 #286983 #56949f', '#191724 #1f1d2e #e0def4 #31748f #9ccfd8'],
  'rose-pine/moon': ['#faf4ed #fffaf3 #464261 #286983 #56949f', '#232136 #2a273f #e0def4 #3e8fb0 #9ccfd8'],
  'catppuccin/frappe': ['#e6e9ef #eff1f5 #4c4f69 #1e66f5 #179299', '#292c3c #303446 #c6d0f5 #8caaee #81c8be'],
  'catppuccin/macchiato': ['#e6e9ef #eff1f5 #4c4f69 #1e66f5 #179299', '#1e2030 #24273a #cad3f5 #8aadf4 #8bd5ca'],
  'catppuccin/mocha': ['#e6e9ef #eff1f5 #4c4f69 #1e66f5 #179299', '#181825 #1e1e2e #cdd6f4 #89b4fa #94e2d5'],
  'arco/arco': ['#ffffff #ffffff #1d2129 #165dff #00b42a', '#17171a #232324 rgba(255,255,255,0.9) #3c7eff #27c346'],
  'semi/semi': ['#ffffff #ffffff #1c1f23 #0064fa #3bb346', '#16161a #232429 #f9f9f9 #54a9ff #5dc264'],
  'glass/glass': ['rgba(255,255,255,0.4) rgba(255,255,255,0.4) #000000 #007aff #34c759', 'rgba(30,30,34,0.5) rgba(30,30,34,0.5) #ffffff #0a84ff #30d158'],
  'glass/clear': ['rgba(255,255,255,0.4) rgba(255,255,255,0.4) #000000 #007aff #34c759', 'rgba(30,30,34,0.5) rgba(30,30,34,0.5) #ffffff #0a84ff #30d158'],
  'glass/frosted': ['rgba(255,255,255,0.6) rgba(255,255,255,0.6) #000000 #007aff #34c759', 'rgba(23,23,23,0.5) rgba(23,23,23,0.5) #ffffff #0a84ff #30d158'],
  'glass/tinted': ['rgba(255,255,255,0.85) rgba(255,255,255,0.85) #000000 #007aff #34c759', 'rgba(36,36,40,0.85) rgba(36,36,40,0.85) #ffffff #0a84ff #30d158'],
  'nord/nord': ['#e5e9f0 #eceff4 #2e3440 #5e81ac #8fbcbb', '#2e3440 #3b4252 #eceff4 #81a1c1 #8fbcbb'],
  'kary/kary': ['#e7f0f7 #f0f6fb #65758d #3778b7 #428226', '#1a1a1a #242424 #cacaca #819dc2 #7da76f'],
  'antd/antd': ['#f5f5f5 #ffffff rgba(0,0,0,0.88) #1677ff #52c41a', '#000000 #141414 rgba(255,255,255,0.85) #1668dc #49aa19'],
  'qiangguo/qiangguo': ['#fffaf6 #f8ebe5 #2b0a0a #b0121a #1d6322', '#2a0000 #4a0004 #ffd700 #ff6b5b #b8f2a0']
};

// What each box in Settings names under the palette: its light and dark variants, with their official names. The menus
// list names alone, so these stay out of the startup bundle; Liquid Glass's note comes with the palette itself.
const variants: Partial<Record<PaletteId, Key>> = {
  'rose-pine/main': 'palette.dawnMain',
  'rose-pine/moon': 'palette.dawnMoon',
  'catppuccin/frappe': 'palette.latteFrappe',
  'catppuccin/macchiato': 'palette.latteMacchiato',
  'catppuccin/mocha': 'palette.latteMocha',
  'arco/arco': 'palette.lightDark',
  'semi/semi': 'palette.lightDark',
  'glass/clear': 'palette.lightDark',
  'glass/frosted': 'palette.lightDark',
  'glass/tinted': 'palette.lightDark',
  'nord/nord': 'palette.nordVariants',
  'kary/kary': 'palette.lightDark',
  'antd/antd': 'palette.defaultDark',
  'qiangguo/qiangguo': 'palette.qiangguoModes'
};

// How a palette's swatch is drawn: Glass over its wallpaper, and Liquid Glass, whose tokens are Glass's, with its lens.
export const swatchOf = (id: PaletteId): SwatchProps => ({
  swatch: swatches[id],
  look: id === 'glass/glass' ? 'lens' : id.startsWith('glass/') ? 'glass' : undefined
});

// The palette menu's sections with each palette's swatch and variants, as Settings takes them.
export const swatchSections = (sections: PaletteSection[], t: Translator) =>
  sections.map(section => ({
    ...section,
    items: section.items.map(item => ({...item, desc: item.desc ?? t(variants[item.id]!), ...swatchOf(item.id)}))
  }));
