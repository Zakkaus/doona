# Themes and palettes

English / [简体中文](themes.zh-CN.md) / [繁體中文](themes.zh-TW.md)

The standard edition defines 16 palettes, each pairing light and dark colors. For choosing a palette, wallpaper or transparency setting, see [appearance settings](https://doona.daeuniverse.org/en/config-and-settings.html#change-appearance).

See the [palette comparison](https://doona.daeuniverse.org/screenshots/palettes.webp) for light and dark examples.

## Source map

| Source                                                      | Responsibility                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [src/shell/palettes.ts](../src/shell/palettes.ts)           | Palette IDs, menu order, label keys, optional wording overrides and the default `rose-pine/moon` |
| [src/shell/preferences.ts](../src/shell/preferences.ts)     | Stored palette validation and `system`, `light` or `dark` color scheme                           |
| [src/shell/useAppearance.ts](../src/shell/useAppearance.ts) | Apply `data-family`, `data-flavour` and `data-scheme` to the document root                       |
| [src/ui/styles/palettes/](../src/ui/styles/palettes/)       | One CSS file per palette family, with light and dark tokens                                      |
| [src/ui/styles/palettes.css](../src/ui/styles/palettes.css) | Imports for palette families that load at startup                                                |
| [src/shell/glass.ts](../src/shell/glass.ts)                 | Load Glass styles and wallpaper when needed                                                      |
| [src/shell/halloween.ts](../src/shell/halloween.ts)         | Load Halloween styles, card art and logo when needed                                             |
| [src/shell/paletteSheet.ts](../src/shell/paletteSheet.ts)   | Link the stylesheet of a family that loads on demand                                             |
| [src/ui/charts/palette.ts](../src/ui/charts/palette.ts)     | Read CSS tokens for charts and observe palette changes                                           |

## Palette contract

A palette ID has the form `family/flavour`. A single-flavour family repeats the name, as in `nord/nord`. CSS selectors use those two values and `data-scheme` to select tokens. Components consume the shared `--rp-*` tokens.

Each palette supplies surface, text, accent, chart, highlight and shadow tokens. The complete token table and contrast rules are in [Add a palette](../CONTRIBUTING.md#add-a-palette). [tools/palettes.test.mjs](../tools/palettes.test.mjs) checks family files, imports and required tokens.

Glass tokens load through [src/ui/styles/glass.css](../src/ui/styles/glass.css), alongside the material styles. Preserve this separate loading path when changing a Glass palette. The Halloween stylesheet, with its card art and the logo it swaps in, loads the same way, only for that palette.

In the Qiangguo palette, a running state reads Improving; unavailable and degraded states read Severe test. In the Halloween palette they read Haunting and Cursed. These wording overrides are defined in `src/shell/palettes.ts` and the locale catalogues.

## Add or update a palette

1. Update `src/shell/palettes.ts` and the family stylesheet. Import a new family from `src/ui/styles/palettes.css`, unless it loads on demand like Glass and Halloween.
2. Add label keys to [src/i18n/locales/](../src/i18n/locales/). An optional `words` map in the registry redirects existing translation keys to palette-specific ones.
3. Keep family images beside the stylesheet under `src/ui/styles/palettes/<family>/`. Record their sources and licences in [NOTICE](../NOTICE) and [REUSE.toml](../REUSE.toml).
4. Update the palette map in [e2e/contrast.spec.ts](../e2e/contrast.spec.ts). Run the palette and contrast checks required by [CONTRIBUTING.md](../CONTRIBUTING.md#add-a-palette), and inspect both schemes. The contrast spec excludes translucent Glass surfaces from its numeric checks.
