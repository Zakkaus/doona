# Pages and navigation

English / [简体中文](pages.zh-CN.md) / [繁體中文](pages.zh-TW.md)

## Pages

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/policies-light.webp" alt="The policies page" width="100%">

| Page          | Shows                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity      | Outbound mode, traffic, memory and process CPU, active connections, node latency, outbound usage, top clients, notifications                                                             |
| System status | Engine and eBPF state, process CPU, traffic counters, runtime degradations, backend capabilities and features that are off; status JSON                                                  |
| Connections   | Live connections with source, destination, matched rule, chain and its source, traffic and transfer rates; edit a writable matched rule's outbound; fold groups, close one or all        |
| Routing log   | The routing map and flow records                                                                                                                                                         |
| DNS           | Queries with answers, cache, resolution log and statistics; per-row rule creation from cache and log entries; query upstream selection; cache entry deletion and flushing when supported |
| Policies      | Groups, members and health; selection, pinning, probing, editing, health-check URLs, tolerance and idle timeout when changeable                                                          |
| Rules         | Routing and DNS request and response rules, editable in their source when writable; template settings in the simple view; rule hits and trace simulation                                 |
| Nodes         | Subscriptions and their refresh interval, inline nodes, add and remove, probe, results by kind and join a group                                                                          |
| Configuration | Create source files and edit them in place, diagnostics, validation, current config version and source export                                                                            |
| Events, Logs  | The backend event stream; the log stream with filters, pause and export                                                                                                                  |
| Settings      | Backends, runtime settings, geodata sources and status, reset to defaults and SHA-256 verification when supported, language, appearance, palette and notification placement              |

A page is marked unavailable only when every resource it needs is unavailable. The DNS rules tab appears when the backend lists DNS rules; editing needs a writable source. Connections, Routing log and Rules request flows while open, without setting Flow recording to Always.

`Ctrl K` searches pages, connections, nodes, groups, rules and sources from anywhere. Which resources each page needs, and where doona keeps its own settings, are on the [features page](https://zakkaus.github.io/doona-docs/en/features.html#pages). Help buttons beside unclear states and terms explain them.

Sign-in is a page of its own: one card centred on the theme background, with Language, Palette and Theme controls in the upper-right corner. The demo fills in the user name `demo` and the password `demo`.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/rules-light.webp" alt="The rules page" width="100%">

## Page tour

### Group membership

On Policies, use the pencil button on a group card to edit its policy and included regions, subscriptions and nodes. The dialog shows the matching nodes and supports undo before saving. New group opens the same editor. Group links on Nodes return to the group card. In a node's Node actions menu, Add to group lists groups from writable main and include files; choosing one opens its editor with the node staged for confirmation. Nodes and subscriptions declared in include files cannot be removed from this page; the disabled action explains why.

### Traffic and connections

The Traffic tab of Connections plots each connection's upload against its download, coloured by outbound; select a point to open that connection. The Connections tab groups live connections by device or by outbound, filters them by protocol and outbound, and exports them as CSV.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/connections-traffic.webp" alt="The Traffic tab of the connections page" width="100%">

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/connections-list.webp" alt="Live connections grouped by device" width="100%">

### DNS

The Statistics tab shows the median and P95 resolution time, the cache hit rate and the failure rate. The charts below place each upstream's lookups on a latency scale and count how the queries ended. Each cache and resolution log row has an add-rule icon for its domain. It opens a DNS request rule when DNS rules are available, or a routing rule otherwise; saving requires a writable configuration source. The default condition matches the exact domain; select a suffix condition to include subdomains.

Query offers Automatic, which follows `dns.routing`, or a named upstream from `dns.upstream` when the configuration is readable. When the backend supports deletion, Cache can remove entries by full name, suffix, keyword or regex, by record type, or both; it shows the matching count before confirmation.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/dns.webp" alt="The Statistics tab of the DNS page" width="100%">

### Log activity

Above the log list, a heatmap counts records per level over time. A level's row header sets the minimum level the list shows.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/logs.webp" alt="The log activity heatmap" width="100%">

### Routing map

The routing map on Routing log follows traffic from rules, or from devices, through outbounds to nodes. Point at or select a rule, outbound or node to highlight the paths through it. On Rules > Trace simulation, the advanced fields accept an optional DSCP integer from 0 to 63 to evaluate `dscp(...)` rules.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/routing.webp" alt="Selecting a rule and then a node on the routing map" width="100%">

### Node latency

The Latency tab of Nodes plots each node's latest latency, and its moving average and the average of the last 10 measurements when the backend reports them. A switch groups the nodes by policy group or by protocol; unavailable nodes appear under their group. Open a node row in the Nodes tab to see the latest TCP, HTTP, UDP and DNS probe results the backend reports, each with its latency or failure reason.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/latency.webp" alt="The Latency tab of the nodes page" width="100%">

### Configuration and settings

Configuration shows the version of the configuration in effect. Modules shows one summary per configuration section and links to the page that manages it. Global settings edits the engine's persistent settings when supported; Config files edits the selected writable source and exports its displayed content, which may contain credentials. A write that changes settings requiring a restart is refused without writing; the notice lists the settings and provides a restart command and an install-guide link.

![Config files with the source editor](https://zakkaus.github.io/doona-docs/screenshots/en/config-source-light.webp)

![Global settings form](https://zakkaus.github.io/doona-docs/screenshots/en/config-global-light.webp)

Settings > Geodata lists the geodata files and shows status and update controls when supported. Reset to defaults asks for confirmation, then removes all geodata overrides and values taken from the configuration file so the built-in sources and defaults apply again. Reload, DNS cache, subscription and connection actions remain on their respective pages, not in Settings. Failure toasts and notices for unknown operation results offer Copy error; Settings > About copies the last 20 errors kept in memory, excluding secrets and request bodies.

### Widgets

The floating widget panel's menu opens Edit widgets, where compatible rate and count widgets can use Sparkline or Key-value list. An unpinned, undocked panel offers Hide at edge; hovering, focusing or tapping its speed summary reveals it. An unpinned floating panel collapses when the page changes.

## On a phone

Below 1024 pixels wide, the side navigation becomes a bottom bar with four hubs: Activity, Traffic, Routing and Settings. A hub opens on the page last viewed in it during the session, and its pages sit in a row above the content. Language, theme and palette move into the top bar's overflow menu, a submenu each. Choose the wordmark in Settings > Appearance.

Below 600 pixels wide, tables keep every column and scroll sideways; on wider screens they drop the columns that do not fit, in a set order. Toolbars wrap onto more rows. On Events and Logs, press a row to read its full text below the table. On System status, DNS and Logs, the first page action stays a button and the rest move into a menu.

Over HTTPS or on localhost, doona installs as an app. In Chrome and Edge, the About card in Settings offers Install as an app. Safari has no install prompt, so the card shows the steps instead. On iPhone and iPad, tap Share, then Add to Home Screen. In Safari 26 on macOS, choose File > Add to Dock.

<img src="https://zakkaus.github.io/doona-docs/screenshots/en/phone.webp" alt="doona on phones: the connections table, the overflow menu and its palette submenu" width="100%">
