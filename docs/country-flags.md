# Country flags

Doona uses the self-hosted Twemoji Country Flags font for every flag in UI text,
including node, group and source names, menus and tooltips. The font comes first
in the body and monospace stacks. Its Unicode range contains regional indicators,
the black flag and subdivision tags; all other characters retain the language's
font stack and the operating system's emoji. Flags use the same artwork on
Windows, macOS, iOS and Android, rather than detecting each operating system.

| Approach               | Appearance and coverage                                                                                    | Loading and text                                                                                                                                                                     | Decision                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Flags-only colour font | Flat Twemoji artwork scales with 12–16 px text and stays on the baseline; all inherited text surfaces work | One 78,292-byte WOFF2, requested when flag text occurs; unchanged emoji remains selectable and accessible                                                                            | Chosen                                           |
| flag-icons SVG         | Crisp flat 4:3 artwork with an explicit icon size                                                          | Individual SVGs can load on demand, but every displayed text fragment needs replacement, including tooltips and chart labels; hidden emoji text must preserve copy and accessibility | Evaluated in the side-by-side screenshot fixture |

The font is a Vite asset, so its hashed URL works with subpath hosting. The existing
service worker precaches it for an unvisited flagged name encountered offline.
This adds 78,292 bytes to offline installation; ordinary rendering remains lazy.
No CDN, platform sniffing or emoji-replacement script runs in the browser.

## Optional prefixes

Settings > Appearance offers Show country flags, default on. The shell passes
the shared lookup into the kit's `CountryFlagsContext`. `NodeName` owns display
prefixes and truncation, including the table, policy tiles and pickers, Activity,
global search, latency charts and their tips, connection rows and routing-tree nodes. Picker items declare
`nodeName`; IDs, `textValue`, filters, sort keys and configuration writes keep the
real name. Group and source names retain their original text.

`src/dae/regions.ts` owns the region aliases used by both flags and the
Policies region filter. Latin aliases require Unicode letter boundaries; Chinese
names may occur beside other Chinese text. Codes that are common English words
(`IN`, `IT`, `MY`, `NO`, `ID`) require uppercase. The first location wins, then the
longest alias at that position. Hong Kong, Macau and Taiwan have separate entries.
An existing regional-indicator pair or subdivision flag suppresses decoration.
Both region and flag lookups cache positive and negative results, each retaining
at most 2,048 names and evicting the oldest entry when full.

Change flag… in a node's row action menu opens a searchable flag picker. The
node row opens its details panel, with the same labelled Flag field beside its
properties. The picker uses common region names, with other names supplied by
`Intl.DisplayNames` in the current language. Hong Kong, Taiwan, Japan, Singapore,
the United States and South Korea appear first, followed by the detector's other
regions, then the remaining regions in locale order. Search matches common and
official names, English names, ISO codes and the detector's aliases.
Automatic shows the detected region. No flag suppresses the added prefix.
Original flags embedded in a name remain part of that name and cannot be hidden
or replaced by a display override. Their Flag field is disabled and explains
this limit.

The `doona-flag-overrides` browser preference holds at most 512 node entries,
keyed by node name. Automatic removes an entry. Older group entries are ignored.
Overrides take precedence over the memoized detector and update every shared
renderer immediately. The master switch hides all added node prefixes.

Added flags are empty, `aria-hidden` spans with CSS-generated content and
`user-select: none`. The DOM text, selections, clipboard, accessible names and
overflow tooltips retain the real name. Every view explicitly declares which
labels are node names; status badges do not control flag decoration. A shared
`--rp-space-1` kit spacing token separates the added flag from its name. Light themes apply a
subtle edge to the decoration, so white artwork remains visible.

## Source and licence

The font is vendored unchanged from `country-flag-emoji-polyfill@0.1.10`:

- Source: <https://github.com/talkjs/country-flag-emoji-polyfill>
- Source revision: `85df0fab7eaff625cc5b48014e105a9356969de1`
- Archive: <https://registry.npmjs.org/country-flag-emoji-polyfill/-/country-flag-emoji-polyfill-0.1.10.tgz>
- Font SHA-256: `9f04f14429bb6a9f415c7a4dd902a918d7e81a4f7526c415496fdb063954e3b8`
- Artwork: Twitter and other Twemoji contributors, CC BY 4.0.
- Font build: Mozilla Foundation, Apache-2.0.

`NOTICE`, `REUSE.toml` and `tools/notices.mjs` retain the attribution and stage the
licence texts in the program archive. The honk-lab notices/provenance helpers
cover dependency closures and tagged embedded releases; this vendored asset uses
doona's existing release tooling. The comparison uses flag-icons 7.5.0 by
Panayiotis Lipiridis, MIT, from <https://github.com/lipis/flag-icons>; those SVGs
are evaluation assets only and do not ship.

## Verification

`e2e/flag-font.spec.ts` checks an actual custom-font glyph in Chromium.
`e2e/flags.spec.ts` proves
that decoration leaves copied names, accessible names, overflow tooltips,
searches and configuration writes unchanged. It also covers Routing log flow records and
node-name chart tooltips, flag editing, browser persistence and kit control sizes.
`src/features/shared/countryFlags.test.ts` covers override resolution, both scripts, English,
letter boundaries, ambiguous codes, existing flags and bounded cache behavior.

For the optional screenshot matrix, set `DOONA_FLAGS_SHOTS=after` (or `before` in
the baseline checkout) and `DOONA_FLAGS_SHOTS_DIR` to an output directory. From
the repository root with dependencies installed, run
`pnpm e2e e2e/flags-shots.spec.ts --project=chromium`; it builds the app before
starting the preview servers. It captures Nodes, a policy
picker including Macau, and Settings Appearance with both preference values, in English desktop light/dark and Chinese
phone light. The baseline has no preference, so its on/off images are identical.
