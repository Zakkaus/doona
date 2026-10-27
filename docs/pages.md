# Pages and navigation

English / [简体中文](pages.zh-CN.md) / [繁體中文](pages.zh-TW.md)

The standard edition groups its pages into four navigation hubs. For page operations and phone navigation, start with the [interface tour](https://doona.daeuniverse.org/en/tour.html). The [monitoring guide](https://doona.daeuniverse.org/en/observe.html), [routing guide](https://doona.daeuniverse.org/en/routing.html) and [configuration guide](https://doona.daeuniverse.org/en/config-and-settings.html) describe the available controls.

## Source map

| Source                                                                | Responsibility                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [src/shell/routes.ts](../src/shell/routes.ts)                         | Route identifiers, the default route, hub membership and `PageProps`                           |
| [src/shell/registry.ts](../src/shell/registry.ts)                     | Page loaders, navigation labels, icons, shortcuts, loading skeletons and resource requirements |
| [src/features/](../src/features/)                                     | Feature pages and their state hooks                                                            |
| [src/shell/widgets/Dashboard.tsx](../src/shell/widgets/Dashboard.tsx) | Activity page                                                                                  |
| [src/shell/SideNav.tsx](../src/shell/SideNav.tsx)                     | Navigation rendering                                                                           |
| [src/shell/search/](../src/shell/search/)                             | Global search                                                                                  |
| [src/i18n/locales/](../src/i18n/locales/)                             | Translated labels referenced by the registry                                                   |

## Navigation hubs

The hub labels below match the English catalogue. Route and hub IDs remain the same in every language. [routes.ts](../src/shell/routes.ts) defines their order.

| Label    | Hub ID     | Route IDs                                       |
| -------- | ---------- | ----------------------------------------------- |
| Activity | `activity` | `activity`, `overview`                          |
| Monitor  | `traffic`  | `connections`, `flows`, `dns`, `logs`, `events` |
| Routing  | `routing`  | `policies`, `nodes`, `rules`                    |
| Settings | `settings` | `config`, `settings`                            |

## Operation notes

These notes supplement the linked user guides with controls and limits that still need to be documented there.

### Sign-in and node details

The demo pre-fills the username `demo` and password `demo`.

Group links in node details open the corresponding group card on Policies. When the backend reports multiple probe kinds, open a node row to see the latest TCP, HTTP, UDP or DNS results, each with its latency or failure reason. For per-node flag controls, see [Change a node's flag](country-flags.md#change-a-nodes-flag).

### XHTTP node options

When Paste node link or Edit… contains a supported VLESS or Trojan XHTTP link, XHTTP options exposes mode, path, host, headers, padding, POST pacing and a separate download peer. The saved value remains the link. The fields update the corresponding query parameters or `extra` JSON members; links that cannot be represented by these fields remain editable as raw text.

Unchanged query parameter strings survive. Editing `extra` reserializes the object, normalizes whitespace and uses JavaScript number precision. Header names are trimmed; duplicate names are case-insensitive and must be corrected before saving. Unfinished header rows count as unsaved changes, and replacing the raw link replaces those rows.

For a changed link, when syntax validation is available, doona asks honk to parse the link alone before writing it. A rejected link shows a translated diagnostic and any backend detail. The 8,192-character limit applies only to adding a node; longer existing declarations can be edited here or in Configuration.

Link validation and saving share one transaction, so group and routing-mode edits wait even if the node dialog closes. The field mapping is in [xhttp.ts](../src/dae/xhttp.ts), and the save flow is in [useNodesPage.ts](../src/features/nodes/useNodesPage.ts).

### Monitoring charts and lists

- On the connections page, Traffic plots each connection's upload against its download, coloured by outbound. List groups live connections by device or outbound, filters by protocol and outbound, and lets you expand or collapse the groups.
- In DNS, Statistics shows median and P95 resolution time, cache hit rate and failure rate. The charts place each upstream's lookups on a latency scale and count how queries ended.
- Above the log list, a heatmap counts records per level over time. Select a level's row header to set the minimum level shown in the list. Select a log row to read its full text below the table.
- The routing map follows traffic from rules or devices through outbounds to nodes. Point at or select a rule, outbound or node to highlight its paths.

### Widgets and phone layout

In Edit widgets, compatible rate and count widgets offer Sparkline and Key-value list. Reveal an edge-hidden panel by hovering over, focusing or tapping its speed summary.

Below 600 px, tables retain every column and scroll sideways. Wider layouts drop columns that do not fit in priority order. Toolbars wrap.

### Install as an app

For the browser to offer PWA installation, serve doona over HTTPS or from `localhost` or `127.0.0.1`; see [installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable#https_localhost_or_loopback_are_required). Chrome and Edge offer Install as an app in Settings > About when installation is available.

On iPhone and iPad Safari, tap Share, then Add to Home Screen. On macOS Sonoma or later, choose File > Add to Dock in Safari. doona shows this macOS hint only in Safari 26 or later, as defined in [install.ts](../src/shell/install.ts).

## Changing a page

1. For a new page, add its route to `routePaths`, assign it to a hub and add a definition in `registry.ts`. The registry is typed as a record of every `RoutePath`.
2. Keep navigation text in the locale catalogues. Set the page loader, skeleton and required resources in the registry.
3. Use `navAvailable` for the navigation availability rule. A page with resource requirements is available when at least one required resource is not explicitly unavailable. Configuration also checks export, import and revision capabilities.
4. Update the corresponding user guide when behavior changes. Keep user procedures on the documentation site and source references here. Remove an operation note only after the guide covers it and this page links to that coverage.

[registry.test.ts](../src/shell/registry.test.ts) and [navGroups.test.ts](../src/shell/navGroups.test.ts) cover the registry and persistence of collapsed navigation groups. For repository checks, see [CONTRIBUTING.md](../CONTRIBUTING.md). This source map covers the standard edition; the lite app has separate source under [apps/lite/](../apps/lite/).
