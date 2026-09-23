# Changelog

This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-beta.2] - 2026-09-24

### Added

- Password setup, sign-in and sign-out for supported backends.
- Group membership editing and group ordering by drag or menu.
- DNS query analysis and cache status, node latency charts, connection traffic plots and log level heatmaps.
- Configuration module editing, recorder settings and links from module cards to their sources.

### Changed

- Show routing as a device-aware tree and open a rule editor from a flow.
- Keep data tabs mounted and use shared fact cards, labels and confirmation dialogs.
- Provide Alpine, OpenWrt, Gentoo, Nix and nfpm package recipes for this beta release.

### Fixed

- Keep source edits within their rules or fields and validate typed values before writing them.
- Preserve each tab's backend session, show failed reads in place and keep loading layouts stable.
- Report DNS cache usage by entry count and cache only the active language for offline use.

### Performance

- Load search, page code and language fonts when needed; reuse warm pages.
- Reduce idle polling and event refetches, retain unchanged results and virtualize longer lists.

## [0.1.0-beta.1] - 2026-09-21

### Added

- A virtualized connections table, flow graph, rule distribution and richer runtime views.
- A configuration editor with validation, diagnostics, quick setup and rule editing.
- Subscription and node management, live logs, backend settings and search across pages.
- Installable offline shell, multilingual messages and release archives with optional fonts.

### Changed

- Consolidate the interface around the native API and shared controls.
- Show retained flows, rule distribution, traffic history and backend capabilities in the product pages.
- Package the beta for distribution and verify archive checksums in the release workflow.

### Fixed

- Guard unsaved configuration changes and hidden routes, and keep streams reconnecting after interruptions.
- Match live backend resource limits and operation responses.

### Performance

- Load feature pages on demand and virtualize the connections table and long node menus.

## [0.1.0-alpha.2] - 2026-09-15

### Added

- A typed native API client, contract-backed mock and resource hooks.
- Connection and flow details, per-network policy selection, routing traces and live events.
- DNS cache actions, runtime controls, traffic history and outbound usage.
- More light and dark palettes, a glass theme and a validation page.

### Changed

- Replace fixture-backed page data with native API operations and capability-aware navigation.
- Keep the glass theme on a gradient wallpaper after trying photo wallpapers.

### Fixed

- Apply the saved palette before first paint and keep long menus from scrolling sideways.
- Show diagnostic reasons and error counts clearly in validation.

### Performance

- Filter and virtualize large node lists and load picker sections in pages.

## [0.1.0-alpha.1] - 2026-09-15

### Added

- An activity dashboard and a themed shell with Rosé Pine, Catppuccin and Nord palettes.
- Themed tables, forms, dialogs, tabs, detail cards and status displays across the initial pages.

### Changed

- Adapt the top bar, cards and controls to narrow screens.
- Align control sizes, links, separators and alert dialogs with the shared UI kit.

### Fixed

- Keep table columns and action cells visible and prevent cards and controls from overflowing.

[0.1.0-beta.2]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/Zakkaus/doona/compare/v0.1.0-alpha.2...v0.1.0-beta.1
[0.1.0-alpha.2]: https://github.com/Zakkaus/doona/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/Zakkaus/doona/releases/tag/v0.1.0-alpha.1
