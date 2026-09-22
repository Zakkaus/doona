# Changelog

This changelog uses the Keep a Changelog format.

## [Unreleased]

### Added

- Settings for the backend, token, language and appearance, with connection checks and first-run setup.
- Installable PWA with an offline application shell; API responses are never cached.
- Virtualized connections table with keyboard selection and deep links.
- Retained-flow graph and rule distribution, with observation coverage and dropped-record counts.
- Keyboard-accessible step evidence disclosures preserving full source JSON, including nested rules and DNS/attempt lineage.
- Runtime outbound usage, traffic history, and flow and connection provenance.
- Native API conformance checks, shared in-flight requests and event-driven resource refresh.
- Traditional Chinese, Simplified Chinese and English translations across the product.
- TypeScript, lint, format, unit, API generation, browser and accessibility checks, plus bundle-size budgets.
- Reproducible program and optional font archives, checksums and a draft-release workflow.
- Sub-path deployment checks and browser support documentation.

### Changed

- Organized one product UI by feature, with shared navigation and capability checks.
- Kept hash routes, query parameters and browser history in sync.
- Connected refresh, search, version details and activity events to live API data.
- Updated the vendored API contract and generated client types.
- Bundled Noto Sans TC under its own name and used local SVG icons.
- Revised English table labels, keyboard scrolling, and control spacing.
- Bounded DNS cache summary pagination with backend domain filtering, and separately labelled selected-node latency for unmeasured nested groups.

### Removed

- Clash-compatible pages and backend kind; doona targets the native API only, per the maintainer's decision.
- S2 panels and UI experiments from product builds; archived sources remain readable.
- Fake rule writes and fixture data from native-mode pages.
- Runtime Typekit requests, Spectrum package dependencies and machine-specific build settings.
