# Country flags

The standard edition uses a bundled Twemoji font to render flag characters and a separate lookup to add display prefixes to node names. For the global display setting, see [appearance settings](https://doona.daeuniverse.org/en/config-and-settings.html#appearance). Per-node controls are described below.

## Font asset and licence

[src/ui/assets/TwemojiCountryFlags.woff2](../src/ui/assets/TwemojiCountryFlags.woff2) is vendored from `country-flag-emoji-polyfill` 0.1.10. The repository ships that font file rather than rebuilding the upstream font.

- Upstream package: [talkjs/country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill).
- Font build source: [mozilla/twemoji-colr](https://github.com/mozilla/twemoji-colr).
- Artwork: Twitter and other Twemoji contributors, CC BY 4.0.
- Font build code: Mozilla Foundation, Apache-2.0.
- File SHA-256: `9f04f14429bb6a9f415c7a4dd902a918d7e81a4f7526c415496fdb063954e3b8`.

[NOTICE](../NOTICE) records the sources and licence terms. [REUSE.toml](../REUSE.toml) records the font asset as CC-BY-4.0. [tools/notices.mjs](../tools/notices.mjs) stages the program's licence texts and checks the licence-file references in `NOTICE`.

[src/ui/flags.css](../src/ui/flags.css) declares the font for regional indicators, the black flag and subdivision tags. [src/ui/styles/foundations.css](../src/ui/styles/foundations.css) puts it first in the body and monospace font stacks. Other characters use the remaining fonts in those stacks.

Vite emits the font under `assets/` with a content hash. The WOFF2 file is 78,292 bytes. It is included in the service worker's shell precache for offline use and in the program archive, independently of the optional Noto archive. Outside precaching, the browser requests it when flag text occurs.

## Node-name prefixes

| Source                                                                        | Responsibility                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [src/dae/regions.ts](../src/dae/regions.ts)                                   | Region aliases shared by name detection and policy-group region filters    |
| [src/features/shared/geo.ts](../src/features/shared/geo.ts)                   | Match a region in a name                                                   |
| [src/dae/flags.ts](../src/dae/flags.ts)                                       | Supported flag choices, localized picker names and embedded-flag detection |
| [src/features/shared/countryFlags.ts](../src/features/shared/countryFlags.ts) | Resolve an added flag from the preference, override and detected region    |
| [src/ui/NodeName.tsx](../src/ui/NodeName.tsx)                                 | Render the prefix separately from the node name                            |
| [src/shell/preferences.ts](../src/shell/preferences.ts)                       | Read and update browser preferences and overrides                          |

The detector chooses the first location in the name, then the longest alias at that location. Latin aliases require Unicode letter and combining-mark boundaries. The ambiguous ISO codes `IN`, `IT`, `MY`, `NO` and `ID` match only in uppercase. Chinese aliases may occur beside other Chinese text. Hong Kong, Macau and Taiwan have separate entries. Region and flag lookups cache both positive and negative results and evict the oldest entry when full.

Overrides are stored in `doona-flag-overrides`, with at most 512 entries keyed as `node:<name>`. An override selects a region or `none`; choosing automatic detection removes the entry. The `doona-country-flags` preference disables added prefixes. A flag already embedded in a name suppresses any added prefix and remains part of the original name.

`NodeName` renders an added flag as an empty `aria-hidden` span whose content comes from CSS. Keep the real name in IDs, search text, sort keys, configuration writes and tooltips. Group and source names do not receive these added node prefixes. Picker items declare `nodeName`; status badges do not determine flag decoration. Added prefixes use `user-select: none`, spacing from `--rp-space-1`, and a subtle edge in light themes.

## Change a node's flag

Show country flags in Settings > Appearance is on by default. Choose Change flag… in a node's row action menu, or open its details and use Flag. Both open the same searchable region choices.

The picker uses common region names and localized `Intl.DisplayNames` fallbacks. Hong Kong, Taiwan, Japan, Singapore, the United States and South Korea appear first, followed by the other regions supported by name detection, then remaining regions in locale order. Search matches common and official names, English names, ISO codes and detection aliases.

Automatic shows the detected region; No flag hides the added prefix. A flag embedded in the node name cannot be hidden or replaced by the picker, and its Flag field is disabled with an explanation. Changes are saved in this browser and update shared node-name renderers immediately. Older group override entries are ignored.

## Change the font or region lookup

1. To update the font, replace the vendored WOFF2 and update its version, hash, sources and licence records here, in `NOTICE` and in `REUSE.toml`. Keep the Unicode range in `src/ui/flags.css` consistent with the replacement asset.
2. To add a detection alias, edit `src/dae/regions.ts`. To add a selectable flag, check `flagRegions` in `src/dae/flags.ts`. These lists serve different purposes; an alias does not add artwork to the font.
3. Use `NodeName` for new node-name displays. Keep display decoration separate from the stored name and preserve the original text for copying and accessibility.
4. Check the relevant tests below. Adding a region requires reviewing detection boundaries, picker labels and ordering as well as rendering.

## Verification sources

| Test                                                                                    | Coverage                                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [src/features/shared/countryFlags.test.ts](../src/features/shared/countryFlags.test.ts) | Aliases, boundaries, ambiguous codes, embedded flags, override resolution and cache behavior |
| [src/dae/flags.test.ts](../src/dae/flags.test.ts)                                       | Picker labels, search terms and ordering                                                     |
| [e2e/flag-font.spec.ts](../e2e/flag-font.spec.ts)                                       | Actual flag-font glyph use in Chromium and the precached asset                               |
| [e2e/flags.spec.ts](../e2e/flags.spec.ts)                                               | Display preferences, editing, copied names, accessible names and shared node renderers       |
| [e2e/flags-shots.spec.ts](../e2e/flags-shots.spec.ts)                                   | Optional desktop and phone screenshot fixtures                                               |

For test setup, see [CONTRIBUTING.md](../CONTRIBUTING.md). With dependencies installed, run the screenshot matrix from the repository root. Set `DOONA_FLAGS_SHOTS` to `after`, or `before` in a baseline checkout, and set `DOONA_FLAGS_SHOTS_DIR` to an existing output directory:

```sh
DOONA_FLAGS_SHOTS=after DOONA_FLAGS_SHOTS_DIR=/absolute/output/directory pnpm e2e e2e/flags-shots.spec.ts --project=chromium
```

The matrix captures Nodes, a policy picker including Macau, and Settings Appearance with flags on and off, in English desktop light/dark and Simplified Chinese phone light. Without both environment variables, the matrix is skipped.
