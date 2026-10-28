# Fonts

The standard edition's Noto Sans TC and SC fonts ship in an optional archive. Without it, the application uses its system-font fallbacks. The flag font ships with the program instead; see [Country flags](country-flags.md). doona lite uses system fonts.

## Sources and licence

[package.json](../package.json) pins `@fontsource-variable/noto-sans-tc` and `@fontsource-variable/noto-sans-sc` to 5.3.0. The local CSS references their WOFF2 subsets directly.

[NOTICE](../NOTICE) records Copyright 2014–2021 Adobe, with Reserved Font Name “Source”. The fonts use the [SIL Open Font License 1.1](../LICENSES/OFL-1.1.txt). Upstream font sources are in [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk).

## Source and build layout

| Source                                                                              | Responsibility                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [src/fonts.css](../src/fonts.css)                                                   | Shared Noto Sans TC Latin, Cyrillic and Vietnamese faces                                                             |
| [src/fonts-tc.css](../src/fonts-tc.css) and [src/fonts-sc.css](../src/fonts-sc.css) | Language-specific subsets with local metric overrides, variable weights from 100 to 900 and `font-display: optional` |
| [src/i18n/languages.ts](../src/i18n/languages.ts)                                   | Each language's font stylesheet and preferred font families                                                          |
| [src/fonts.ts](../src/fonts.ts)                                                     | Archive detection and stylesheet loading                                                                             |
| [vite.config.ts](../vite.config.ts)                                                 | Hashed Noto files under `dist/fonts/`, plus `OFL.txt` and this page as `README`                                      |
| [tools/package.sh](../tools/package.sh)                                             | Copy `dist/fonts/` into the separate `doona-fonts-<version>.tar.gz` archive                                          |

The Noto files stay outside the service worker's shell precache. [public/sw.js](../public/sw.js) caches successful font requests when it controls the page. The browser loads these files from the same host as the application.

## Loading behavior

In a production build, the first font load requests `fonts/README`. `src/fonts.ts` shares that probe for the lifetime of the page. It attaches the font stylesheets only if the response succeeds and its content type does not contain `html`. A missing archive therefore still causes the README probe, but does not load Noto font files.

In development, the loader skips the probe and uses the installed Fontsource packages. [src/i18n/index.ts](../src/i18n/index.ts) loads the selected language's stylesheet with its catalogue. The common stylesheet also warms the Noto Sans TC face with the text `doona`.

Before publishing each catalogue stage (core, Activity and later pages), the loader awaits `document.fonts.load` for every message in that stage, including plural forms. The text comes from the catalogue, not a separate glyph list. Each subset is variable across weights 100–900, so loading it once makes it available at every UI weight. This also applies when changing languages.

Declaring the stylesheets or waiting for `document.fonts.ready` after rendering is not enough: `font-display: optional` can retain a system fallback for a late subset beside already-loaded Noto glyphs within one title. Loading the stage's glyphs before rendering avoids that mixture without a later font swap. Each stage waits at most three seconds for the archive, stylesheets and fonts, then renders with the system fallback if they are still pending. An absent archive or a failed font request also allows system-font rendering.

Only subsets intersecting the loaded catalogue stages are fetched, rather than the whole archive. This can fetch more subsets than the currently visible page uses. Segmented-control labels remain regular weight (400), as defined in [segmented.css](../src/ui/styles/segmented.css). [e2e/flag-font.spec.ts](../e2e/flag-font.spec.ts) checks actual Chromium title faces with delayed subsets in both Chinese languages at weights 400, 500, 600, 700 and 800.

## Update or add fonts

1. Update the Fontsource dependencies and lockfile together. Compare their `index.css` subset URLs and Unicode ranges with the local declarations.
2. Preserve the local metric overrides and `font-display: optional`. Keep the Latin faces at the end of `fonts-tc.css`, after overlapping ideograph subsets.
3. For a new language-specific stylesheet, use `src/fonts-<name>.css` and set that language's `fonts` and `faces` entries in `src/i18n/languages.ts`. A new font family also needs a matching asset rule in `vite.config.ts` if it belongs in the optional archive; the current rule recognizes only Noto Sans TC and SC WOFF2 filenames.
4. Update the source and licence records in `NOTICE`, `REUSE.toml` and `LICENSES/` as needed. Keep this page accurate because the build includes it in the font archive.
5. Check the generated `dist/fonts/` and test both an installed and an absent font archive. [e2e/flag-font.spec.ts](../e2e/flag-font.spec.ts) covers font requests, font stacks and exclusion of Noto subsets from the shell precache.

See the [development guide](https://doona.daeuniverse.org/en/development.html) for build prerequisites and commands, and [package layout](install.md) for the release archives.
