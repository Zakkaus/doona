# Changelog

This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Routing traces accept an optional DSCP value from 0 to 63 to evaluate `dscp(...)` rules. (#332)
- The DNS cache tab deletes entries by full name, suffix, keyword or regex, by record type, or both, after showing how many match, when the backend supports it. (#306, #314)
- The DNS cache tab deletes entries by exact name and record type when the backend supports it. (#306)
- A failure toast, and the notice for an operation with an unknown result, has a Copy error action on its button row, after the toast's own button if it has one. It copies the request, status, error code, backend message, request ID and operation for a bug report, so the browser console is no longer needed. Settings > About has a Copy recent errors button for the last 20, kept in memory only, with secrets and request bodies left out. (#304)
- The DNS query tab can send a query to one of the upstreams the configuration's `dns.upstream` defines instead of the one `dns.routing` picks. The picker appears when the configuration is readable and names at least one upstream. (#330)
- The floating widget panel's menu adds Hide at edge: an unpinned, undocked panel hides at its nearest screen edge behind a summary sized to its backend light and speed text, with square corners and no border against that edge. Hovering, focusing or tapping the summary reveals the panel. Edit widgets stays in the menu so the collapsed header has room for both speeds. (#322)
- The Geodata card on Settings has a Reset to defaults button beside Update now that, after a confirmation, removes every geodata override and every value taken from the configuration file, so the built-in sources and defaults apply again. (#331)
- Node details on the Nodes page list the latest result of each probe kind the backend reports, TCP, HTTP, UDP or DNS, as its latency or the reason it failed. (#329)
- The CPU usage and latency tiles on the Activity page draw a sparkline like the traffic tiles. CPU follows the session's runtime polls; latency follows the selected node's readings from the node list, leaves failed probes as gaps, and starts over when the tile picks another group. A switch under Settings > Appearance shows or hides the sparklines on every metric tile. The latency tile keeps its group picker on the caption's line at every width, so it has the same two lines as the other tiles. A sparkline appears once it has two samples, never as a lone dot. The demo reports a fresh probe time on each node list read and a fresh sample on each runtime read. (#321)

### Changed

- Internal: the Noto fonts come from Fontsource packages instead of 208 committed files; the built fonts are unchanged. (#351)
- Internal: ring history state, its persistence and hook live in the store instead of the API layer; no visible change. (#341)
- Internal: production builds minify with Terser, cutting total JavaScript by about 16 KB gzip; no visible change. (#352)
- Internal: floating widget contents are split by widget family; no visible change. (#344)
- Internal: the kit's Disclosure, Menu and table helpers are split into their own files, and tooltips share one style; no visible change. (#342)
- Internal: group editor member and condition logic and the connections table projection are split into their own modules; no visible change. (#343)
- Internal: page-only components and helpers load with their pages, shrinking the shell bundle by about 20 KB gzip; no visible change. (#347)
- Node actions put group choices in an Add to group submenu without policy descriptions, with New group after a separator. Native policy labels follow honk's normalised behaviour in all three languages. (#336)
- Count labels name subscriptions, rules, notifications, connections, nodes and DNS lookups instead of appending counts in parentheses, with English singular and plural forms. (#339)
- The runtime overrides card on Settings links to the persistent settings in Config with a button instead of a plain text link. (#294)
- A write that changes a setting only a restart applies is refused with a notice that stays on the global settings form and the source editor. It lists the settings, says nothing was written, and gives the restart command with a link to the install guide's Reload and restart section. The demo refuses a changed `data_dir` the same way. (#295)

### Fixed

- Disabled page and card actions show their reasons without hovering, including on touch devices. (#340)
- Small action buttons size their icons to the text line height, so the edit pencil fits beside the policy group menu.
- Small action buttons size their icons to the text line height, so the edit pencil fits beside the policy group menu. (#349)

- Connection group headings span the empty columns before their totals, keeping the connection count readable on phones. (#339)
- Table headers and cells use start alignment, including numeric columns with tabular digits. Action headers align with the first action slot's icon inset. Rule actions keep their source, edit and remove slots when a button is absent. (#320)

- The floating widget panel collapses again when you leave a page through the sidebar or a link; rate charts in widgets list their series with the latest values at full size; the connections chart in widgets uses the same colour as on Activity; the recomputed mark on Flows is the badge Connections uses; and pickers announce an option's name apart from its description.
- The node grid in a policy group updates its marks and highlight when you switch between TCP and UDP on a long list of nodes.
- A refresh that finishes with a warning, or fails for some sources only, now shows a warning toast in the notice colour instead of an information toast. Warning badges and code strings stay readable in the light palettes whose gold is too pale for text. The warning toast uses the same text colour as the other solid toasts. (#313)
- The floating widget panel collapses again when you leave a page through the sidebar or a link; rate charts in widgets list their series with the latest values at full size; the connections chart in widgets uses the same colour as on Activity; the recomputed mark on Flows is the badge Connections uses; and pickers announce an option's name apart from its description. (#313)
- The node grid in a policy group updates its marks and highlight when you switch between TCP and UDP on a long list of nodes. (#313)
- Chart tooltips dismissed with Escape stay closed when live data updates; Enter or an arrow key opens them again. (#321)
- Pressing Enter twice quickly on a drag handle no longer starts a second drag and raises an error; the second press is ignored until the first drag is ready for its keys. (#300)
- On the Config page, every module card shows one summary line under its header instead of status dots, a per-node edit link list, and the group policies. The Nodes page no longer accepts the `editNodeSource` link parameter that only those links used. (#298)
- An operation the backend accepted whose progress can no longer be read is reported as having an unknown result, and the page is read again, for every operation rather than only configuration writes. A group selection or runtime setting refused as temporarily unavailable reads the group or the settings back, since the change may have been stored, and the control stays busy until that read lands and the backend's Retry-After has passed. (#303)
- Applying held rules keeps going when the page that started it closes: rules whose file the backend accepted leave the held list, so the next apply does not write them a second time. (#303)
- An operation whose result is unknown is reported with a neutral notice instead of an error when it comes from applying rules, a group action, a geodata update, refreshing every subscription or saving runtime settings. A rule apply that fails after its dialog or page closed reports the failure as a notice. (#303)
- A runtime setting or a subscription edit put back to its stored value no longer counts as unsaved, so leaving the form does not ask to discard it. (#303)
- Chinese translations distinguish backend profiles from configuration files, use subscription update labels that fit any count, and clarify that saving backend settings creates a profile. The sign-in game's accessible name uses a neutral term for the duck. (#302)
- The demo applies DNS log and flow capacities and terminal-flow retention, bounds completed operations, and disables group configuration edits in its base profile. (#305)
- The page tab bars on Nodes, Connections, Flows, Rules, DNS and Config are 32px tall again on desktop, like the controls beside them: the tabs fill the bar instead of sitting 2px inside it. Other controls are unchanged. (#299)
- On a phone, the About dialog stacks its links full width instead of leaving one alone, scrolls its content between the title and the Close button, and every dialog keeps its bottom margin above a mobile browser's toolbar. The desktop layout is unchanged.
- The full-name tooltip that keyboard focus opens on cut text no longer closes by itself shortly after the pointer has left it. (#317)
- A group whose filter names a value with an apostrophe, such as `name("O'Reilly")`, opens in the group dialog with its filter as text instead of failing to open.
- Group member previews and counts read `regex:` filters in honk's Rust syntax, such as `\p{Han}`, `\-` and `[[:alpha:]]`; a pattern doona cannot translate leaves the filter as text.
- Renaming a subscription rewrites only the changed values inside its group filters; other values and other filter lines keep their spacing and quotes.
- In the add-rule dialog, switching from Expression back to Select turns the edited expression into condition rows; an expression the rows cannot hold stays in Expression with a hint, and an emptied expression starts again from one empty row.
- Adding a rule from a flow record or a trace offers "Before the matched rule" only when the match comes from the rule list's current generation.
- Saving a subscription writes only the fields changed in the dialog, so a link or name updated in the source meanwhile is no longer overwritten.
- On the Nodes page, Add to group lists the groups of every writable include as well as the main source, and stays available when only an include can be written; groups are not offered while a write is in progress.
- A group whose filter names a value with an apostrophe, such as `name("O'Reilly")`, opens in the group dialog with its filter as text instead of failing to open. (#315)
- Group member previews and counts read `regex:` filters in honk's Rust syntax, such as `\p{Han}`, `\-` and `[[:alpha:]]`; a pattern doona cannot translate leaves the filter as text. (#315)
- Renaming a subscription rewrites only the changed values inside its group filters; other values and other filter lines keep their spacing and quotes. (#315)
- In the add-rule dialog, switching from Expression back to Select turns the edited expression into condition rows; an expression the rows cannot hold stays in Expression with a hint, and an emptied expression starts again from one empty row. (#315)
- The Select and Expression switch in the add-rule dialog is as wide as its two segments instead of the whole dialog; every segmented control keeps its own width in a column or a grid. (#315)
- Adding a rule from a flow record or a trace offers "Before the matched rule" only when the match comes from the rule list's current generation. (#315)
- Saving a subscription writes only the fields changed in the dialog, so a link or name updated in the source meanwhile is no longer overwritten. (#315)
- On the Nodes page, Add to group lists the groups of every writable include as well as the main source, and stays available when only an include can be written; groups are not offered while a write is in progress. (#315)
- A failed operation shows as an error in the Activity notices instead of a plain notice. A failed refresh of the Activity ranking, outbound usage and status cards, the DNS statistics and the simple rules view keeps the data it has and shows the error with Retry above it. (#331)
- Switching profile or signing out while another form has unsaved changes asks first and changes nothing if declined; before, the saved profile or token changed first and the page stayed busy after the prompt was declined. (#331)
- A write that was accepted but whose result is not confirmed shows as a notice instead of a failure in the group and node dialogs. (#331)
- The connection outbounds widget no longer asks a backend without outbound traffic for it. The Geodata card shows when the groups for the download route cannot be read and offers Retry. The routing tree no longer draws a node left over from a group hidden inside another group. Cancelling the widget editor after Restore defaults moved the panel asks to discard the change. Saving a source or the global settings keeps the draft until the new configuration is read back; when the read fails after the write landed, the draft stays and Retry is offered. (#331)
- Remove is disabled, with the reason shown, for a node or subscription declared in an include file, which the backend only removes from the main source. (#333)
- The groups column of the Nodes table no longer scrolls inside each row or cuts a tag mid-word. It shows as many whole group tags as fit the column and a "+N" tag for the rest, which names all of the node's groups on hover or keyboard focus. The tags refit when the column or the window resizes. (#320)

## [0.1.0-beta.12] - 2026-09-30

### Changed

- Latencies are coloured by speed again: green below 100 ms, yellow below 300 ms, and red from 300 ms or when the node did not answer. This applies to the nodes table and chart, the node menu, the Activity latency tile and the Policies member grid. (#231)
- The release attaches honk-core debug builds rebased on daeuniverse/honk main. They add main's VLESS Vision uplink padding and splice handover ([honk#304](https://github.com/daeuniverse/honk/pull/304)), compare DNS upstream names without their quotes ([honk#305](https://github.com/daeuniverse/honk/pull/305)), and embed doona 0.1.0-beta.12.

### Fixed

- On a phone, the About dialog shows the doona version; only the top bar leaves it out for lack of room. (#228)

## [0.1.0-beta.11] - 2026-09-30

### Changed

- Name lists sort by the interface language: pinyin in Simplified Chinese, stroke order in Traditional Chinese, and Latin names before Chinese ones in English. (#226)
- Events of a kind this version does not know appear on the Events page with their raw kind and the resource they name. (#225)

### Fixed

- The release attaches honk-core debug builds that start with a state database written by the builds attached to 0.1.0-beta.9, which the builds attached to 0.1.0-beta.10 refused ([Glassyiris/honk#85](https://github.com/Glassyiris/honk/pull/85)).
- The new-version notice appears only when the service worker holds a different build from the open page, and a notice left by an earlier build is dropped. (#223)
- The open-at label names the configuration source it opens. (#223)
- The release packages install every licence file that NOTICE cites and a THIRD-PARTY-NOTICES.txt for the production dependencies, and the package metadata declares the image licences. (#224)

## [0.1.0-beta.10] - 2026-09-30

### Added

- A connection, flow record or trace result opens the shared add-rule dialog with its domain, destination or source address. The dialog offers exact domains before subdomains, names a duplicate rule without blocking it, and offers Copy rule after a target is chosen when no writable configuration can take it. After a rule takes effect, View rule opens it in the list. (#172, #210)
- The DNS resolution log, query results and cache can start a DNS request or response rule. The dialog offers the relevant name, answer address, client and record type, and can create a missing request or response rule block. Held DNS rules can be reviewed and applied from their lists. After a DNS rule is written from Query, Query again repeats the query for its original name when the backend offers DNS queries. (#165, #175, #209)
- The Nodes table searches every source while a search is entered and shows a Source column for the matches. Clearing the search returns to the selected source. (#176)
- Search includes the Connections, Nodes and Policies tabs, DNS rules by condition and target, and page tabs in its empty-result guidance. (#195)
- When a subscription has one identifiable declaration, its More actions menu offers an edit action if that source is writable, including an include file under a read-only main source; otherwise it offers Open source. Editing changes its name or URL while keeping the other options and comments. A duplicate subscription name opens the source instead. A name clash, a `subtag(...)` reference in another file, or a filter expression naming the old tag blocks a rename; exact `subtag(...)` filters in the same file can be updated with it. After a conflicting save, the next attempt uses the current source revision. (#179)
- A connection detail can start a routing trace with its source port and process. Trace results link to the rules, groups, nodes and names they show; a rule link opens the list only when the result and list belong to the same routing generation. (#174, #210)
- The editor toolbar offers Find, Go to line and an Editing commands menu for undo, redo and comment toggling. Find and Go to line also work in a read-only source. (#169)
- Policies offers the Score policy when choosing a group's selection policy. (#201)
- Activity shows process CPU usage in place of the memory stat card; its value opens System status. Rate tiles open Connections on the traffic tab, and the active-connections tile opens the list. (#173, #186, #194)
- Activity rankings, outbound usage and node latency link to filtered Connections or the corresponding node. DNS statistics, resolution records and rule lists link to the related DNS view or configuration section. Events, logs and flow records link to the flow, configuration or recording settings they name. (#171, #173)
- Settings > About opens the keyboard shortcut dialog and the guide. Routing rule rows can open their outbound settings, Nodes can refresh all subscriptions, and the DNS resolution log offers Load older records below its list on a phone. The Nodes table names the selected source, and Activity's latency menu explains that choosing a node changes only the displayed latency, not routing. (#170)
- A saved quick setup offers links to Nodes, Policies, Routing rules and the file it wrote. A group change offers View group, and a new subscription offers View nodes with that subscription selected. (#173, #187)

### Changed

- The release attaches honk-core builds of honk e2dc7c0b (`debug.2026.9.30.native-api.3`), which implement the final native API contract and include honk's fix for a `domain()` condition that mixes `geosite:` with ordinary entries ([honk#303](https://github.com/daeuniverse/honk/pull/303)). (#178)
- Monitor contains Activity, System status and the new Routing log page for the routing map and flow records. Rules keeps routing rules, DNS rules and trace simulation; Configuration opens first in its hub. Old links to the map and flow records lead to their new page. Connections opens on Traffic. On phones, the hub strip keeps the current page visible, and Back returns through visited pages. (#166, #176, #180)
- The top bar shows Apply only while rules are held; it writes those rules. Reload honk is a separate confirmed action and leaves held rules in place. Rule writes and configuration edits use Apply, and success messages say when a rule is in effect. Held rules remain when an activation reports that nothing was written. (#178, #187, #189)
- The add-rule dialog shows the current outbound or DNS upstream beneath an initially empty target field instead of choosing that target for the new rule. It warns when a routing rule would keep the current outbound and explains where the rule will be inserted. (#199)
- Connection detail actions, subscription removal and policy group commands move into More actions menus, leaving one primary action on each panel. (#198)
- A tile with a linked value can be opened from anywhere on the card. (#192)
- The China palette's light and dark modes are named Day shift and Night shift. The keyboard shortcut dialog groups commands into sections and shows page shortcuts as G followed by a letter in separate keycaps. (#202, #203, #207)
- The interface calls the configuration revision Config version, the global mode's target Global mode outbound, and the documentation link Guide. `generation` remains a technical field. (#190)
- Overview is named System status, the Policies page's Arrange tab is named Group membership, and configuration module shortcuts say Open source file. (#176)
- A trace run in query mode shows the DNS query answer separately from the simulations for its returned addresses, with query time and simulation time shown apart. (#165)
- The final API contract governs sign-in, paging, group edits, DNS queries, operation results and errors; an older honk build shows an update message at sign-in. An expired page restarts at the contracted limit. Node and subscription writes wait for asynchronous operations to finish, and a node write conflict keeps the backend's own message when it identifies the cause. Activation notices distinguish a failed, degraded or unconfirmed outcome. (#178)
- Policies waits for initially visible group cards to load their details and nodes before showing them; a card scrolled out of view does not hold the page open. An unset tolerance is labelled as the engine default in the check settings dialog. (#205, #210)
- System status marks hooks that honk attaches without reading back as Not verified and explains why. When the final contract reports them, it also shows cgroup and other eBPF attachments. (#165, #178)
- A disabled Apply or Save button no longer has a "No changes" line beside it, and a healthy Activity latency tile no longer shows a Good light. (#193)
- A first visit tries the browser's preferred languages in order. (#213)
- Plain lists use each catalogue's separator. (#213)
- Byte, rate and login-game units and shortcut key names come from the catalogues. (#214)
- The login game's numbers use the selected language's thousands separators. (#214)
- Latency summaries, submenu choices and chart label-value pairs are translated as whole messages. (#215)
- Chinese copy keeps `routing`, DNS `request`/`response`, `ACL4SSR Mini`, `ACL4SSR Online` and `ACL4SSR Full` verbatim; zh-TW uses 檢視 for view. (#218)
- Decimals and durations follow the selected language, and file counts pick their plural form independently of the rule count. (#221)

### Fixed

- Node latency tests probe through the node over HTTP to honk's configured check URL. A bare TCP connection to the node's server is used only when the backend does not offer HTTP probes, so Hysteria2 and TUIC no longer fail solely because their server does not accept TCP. IPv4 and IPv6 results are combined, and known probe failures show a translated reason instead of a raw code. (#208)
- Node and policy latency values use the normal text colour below 600 ms, yellow at 600 ms or above, and red only when unavailable. The Activity latency tile uses the same colour threshold for measured values and a red status light when unavailable. (#208)
- Policies edits a group in the source file that declares it, including an include file. A read-only file is named as the reason editing is unavailable, and a group declared more than once is refused. If no loaded configuration file defines the group, the disabled edit action says so. The page refreshes group selection while visible. (#163, #177)
- An expired DNS resolution-log cursor starts again at the newest page instead of retrying the expired cursor. A DNS cache listing whose snapshot becomes unavailable restarts its walk once after the backend's requested wait. A discovery request refused with a contract error reports that refusal instead of offering an obsolete token sign-in. (#163, #209)
- On an engine whose configuration syntax doona does not know, the global outbound mode is shown as not provided instead of being read or written as a dae rule. (#163)
- Rules remains available when the backend offers DNS rules but no routing rules. (#209)
- A connection forwarded by the kernel cannot be closed from its detail, and the disabled action explains why. Rules in an include file and other blocked edits name the reason instead of leaving an unexplained action. (#184)
- A missing application chunk after an update reloads the page once when its loading boundary catches the failure. A failed language catalogue or search dialog load keeps its own error handling. (#196)
- Narrow menu items keep their titles visible when their descriptions wrap. Hidden tab panels keep their width when reopened; DNS log type and duration columns fit their values. A table at fractional zoom no longer drops a column after its first layout. (#181, #183, #185)
- A refused synchronous write, including closing connections or changing runtime settings, is reported without retrying the write. (#168)
- The China palette's pinned top bar no longer carries a torn strip of its hero image over scrolled content. The Glass palette keeps the sign-in game's mortar and score card readable. (#167, #204)
- When a new version took over an open page before its language had loaded, the update notice showed message keys such as `ui.newBuild` instead of its text. It now waits for the language to load. (#212)
- The startup failure screen reads its text and Retry label from the catalogues, including when the saved language cannot load. (#213)
- Request IDs travel as error metadata, so notices no longer extract them from translated text. (#215)
- The demo's configuration validation diagnostics are translated by code in both rows and editor marks. (#216)

### For contributors

- The bundled API contract moves to api-standardize `honk` at `1fb08ad`. The conformance tool follows the final contract, including its status codes, paging, operation starts and event invalidation. (#178)
- The browser suite runs over four parallel CI runners. (#200)
- Plurals use each language's CLDR categories and a named plural selector; English fallbacks use English rules. (#217)
- Language-neutral tests use French and Arabic fixtures without bundling them as languages. (#217)
- CONTRIBUTING requires configuration keywords and preset names to stay verbatim in translations. (#218)
- Catalogue keys have area prefixes, and duplicate messages are merged. (#219)
- `check:i18n` scans visible literals with an AST and checks CodeMirror phrase arguments. (#220)
- Font faces come from the language registry. (#220)

## [0.1.0-beta.9] - 2026-09-28

### Added

- Rules has a DNS rules tab beside the routing rules. It lists the request and response rules the backend returns from `GET /dns/rules` and adds, edits and removes them in the source that declares them, as the routing rules do. A DNS upstream is written with its quotes exactly as declared. The tab appears when the backend lists DNS rules. (#148, #151)
- The connection detail can edit the matched rule's outbound: the rule's dialog opens on Rules and changes only the target, keeping the condition and any comment. The action appears only when the rule is found in a writable source. (#150, #158)
- A DNS resolution record opens a new DNS request rule for its domain, prefilled with a suffix condition that also matches subdomains. The link appears when the backend lists DNS rules and the configuration is writable. (#150, #158)
- The China palette. Clock-in (light) is rice paper with a flag-red banner and All-nighter (dark) a red and gold poster. A red sky with the five stars and Tiananmen Square runs across the top of the page, and cards take turns with faint drawings of the Great Wall, Mount Tai's South Gate of Heaven, Kuimen and Sun Moon Lake. In this palette a healthy or running state reads Improving and an unavailable or degraded one Severe test. NOTICE and `REUSE.toml` credit the Openclipart and Wikimedia Commons sources. (#143, #155, #156, #158)
- The sign-in page offers the palette menu between the language menu and the theme toggle. (#139)
- The geodata card has a Verify checksum switch when the backend reports one, for mirrors that answer a missing `.sha256sum` file with an error page. The two checksum failures point to it; a mismatch says the file may be damaged or altered and that verification should be turned off only when a trusted mirror's `.sha256sum` file is known to be wrong. (#144, #158)
- The check settings dialog on Policies edits a group's tolerance and idle timeout when the group lists them as changeable. (#147)
- The connection detail shows where the chain came from: recorded during routing or reconstructed from retained records. (#147)
- Overview shows runtime degradations, the features honk keeps running reduced after a recovered failure, as warnings on the Datapath card. They show even when the datapath cannot be read. (#152, #158)

### Changed

- The release attaches honk-core builds of honk 3ff52762 (`debug.2026.9.28.native-api.4`), which serves the DNS rules, runtime degradations and the checksum switch. (#161)
- The first navigation hub is named Activity and lists Activity before Overview, so it opens on its first tab. (#140)
- Rules lists its tabs as Routing rules, DNS rules, Routing map, Flow records and Trace simulation, and opens on Routing rules; a link to the map still opens the map. DNS lists Statistics, Resolution log, Cache and Query, and Settings shows Appearance before Backend actions. (#148, #149)
- Automatic flow recording is labelled On flow demand, and a note says that any client's flow requests start it and that it continues for 60 seconds after they end. (#136, #158)
- Without the state database, the backend actions card says that honk takes the geodata URLs from `geosite_download_url` and `geoip_download_url` in `experimental.native_api` and does not update on a schedule, and links the documentation and Configuration. Known geodata download failure stages have their own message; an unknown stage shows its code. (#142)
- Overview shows No limit when the cgroup sets no memory limit, leaves out the cgroup scope when it is unknown and eBPF kernel memory when it is not reported, and hides partial eBPF hook visibility. A map whose occupancy is not read shows only its capacity. (#153)

### Fixed

- On a stock honk, Connections and Rules showed no flows unless flow recording was set to On. They now request flows while open. (#136)
- Pages no longer miss a change made while they open, such as another client's configuration or rule edit: they read their data once the event stream is ready. Behind a proxy that holds the stream back, pages still load after five seconds, and the configuration and rules refresh every 30 seconds while the stream stays silent. (#160)
- Connections and Rules request flows on the shared event stream instead of opening a second one, so they no longer count twice against the backend's client limit and also work on backends that send flow updates without flow gaps. (#160)
- Pages with tabs no longer move by a tab's height after the first frame, and the Connections table no longer resizes itself after opening. (#141)
- When another client changed a group's check settings, every save from the open dialog was refused as a conflict. The dialog now reads the group again, keeps the fields the user edited, shows the values the group took, and the next save checks for conflicts against them. (#145, #158)
- Policies no longer offers group switching or check settings when the backend turns them off for all groups, where every save failed. (#157)
- After a rate-limited sign-in, the button stays disabled and counts down the wait instead of meeting another refusal, and the note above the form clears when the wait ends. (#157, #162)
- The rule lists link each rule to its line on a read-only backend too. The DNS rules tab no longer breaks Rules on an older backend, and a DNS list without a written fallback takes new rules inside its block. `upstream()` in DNS rules is highlighted as a call. (#148, #158)
- In the Glass palette, quiet negative buttons such as Close all are filled with Apple's increased-contrast red, and red text uses that red, so both meet contrast on the translucent surfaces. A quiet button pressed by keyboard or touch shows its pressed fill. (#154)
- The demo answers as the API contract describes: required fields are present, elapsed times are whole milliseconds, lists page 100 rows by default and at most 1000, discovery serves its public view before sign-in, and features a profile turns off are refused. (#159)

### For contributors

- Each language's strings are in one JSON catalogue, `src/i18n/locales/<id>.json`, and `src/i18n/languages.ts` lists the languages once. A language can be partial and fall back to English. `check:i18n` checks every catalogue against `en.json`, including each plural form's placeholders and repeated keys, and `--missing <id>` lists what a language lacks. CONTRIBUTING describes how to add a language. (#137, #158)
- Each palette family has its own stylesheet, a palette can reword a few statuses, and CONTRIBUTING describes how to add a palette. (#138, #143)
- `pnpm check` validates the demo backend in each profile against the bundled OpenAPI contract, and `check:gen` fails when the vendored contract no longer matches the SHA-256 pinned in `SOURCE.md`. (#159)
- The API contract is pinned at api-standardize aa7103a. (#144, #152)

## [0.1.0-beta.8] - 2026-09-28

### Added

- Each release attaches the eight honk-core builds of honk's `debug` pre-release, so honk does not have to be compiled: x86_64 and aarch64, glibc and musl, each with mimalloc or the system allocator. `honk-source-<commit>.tar.gz` holds the source of the honk commit they were built from and `HONK-SOURCE.txt` names that commit; `SHA256SUMS` lists every release asset except itself. The builds are attached until honk publishes a release with the native API. (#109, #117)
- Sign-in is a full page instead of a dialog over an empty window, with its own language menu and theme toggle. From 1024 pixels wide, a panel beside the form shows a construction scene that becomes a small Flappy Duck game when pressed. The form keeps working if the scene fails to load, and the scene is a still picture when reduced motion is requested. (#107, #114, #115)
- The public demo opens on the sign-in page with its account filled in: user name `demo`, password `demo`. (#107)
- The setup guide is a separate documentation site in English, Simplified Chinese and Traditional Chinese, maintained in [Zakkaus/doona-docs](https://github.com/Zakkaus/doona-docs). Sign-in and Settings > About link to it; the sign-in hint for a backend without the native API and the read-only outbound mode help open its troubleshooting sections. (#100)
- The documentation site has step-by-step installation pages for Debian or Ubuntu, Fedora or RHEL, Arch Linux, Gentoo, OpenWrt and other systems, and follows the layout of the React Spectrum docs. Its search ranks titles first and works from the keyboard, the 404 page is in the reader's language, and Chinese pages use the Spectrum CJK type scale. Colours are correct in Safari 17.0 to 17.4, and links into doona's source work when the pages are read on GitHub. The pages are shared under CC BY 4.0, and the header links to the demo. (Zakkaus/doona-docs#1, #2, #3, #6, #11, #13, #14)
- Help buttons explain unclear states and terms on Overview, Connections, Configuration, Rules, Policies, DNS, Events, Logs and Settings. (#98)
- Overview lists the features that are off in a full-width card, one row per cause. Where one applies, a row explains the cause, gives the configuration lines that turn the feature on, or links to the documentation or Settings. The rule list, validation and closing connections are listed when the backend lacks them. The count on Activity links to the card. (#102)
- A disabled action says why in a line beside its buttons, visible at every width, where before the reason was only in a tooltip that touch does not open, or missing. This covers Configuration, Activity, Policies, Rules, DNS, Nodes and Settings, and the dialogs for new rules, subscriptions and nodes. Screen readers read the line as the button's description. (#97, #127, #130, #133)
- Connections can collapse and expand each group, or all groups at once, while the list is grouped. (#93)
- On Events and Logs, pressing a row, or Enter or Space on it, shows its full text below the table, so text cut on a phone can be read; pressing the row again hides it. (#105)
- The demo shows its error states when opened with `?scenario=faults`; `?scenario=` returns to the healthy demo. (#103)

### Changed

- The demo behaves as a healthy honk: it seeds no failures, and switching the outbound mode works. (#103)
- The Overview header and the Activity status add a degraded or failed datapath to the engine state, in the matching tone. The Overview header links to the Datapath card. (#102)
- Backend features on Overview lists only the features that are on. (#102)
- Configuration shows each source's path once. A read-only source has one badge naming the reason (generated, subscription, read-only, contains secrets, redacted or text not returned) and no Validate button; when configuration writes are off, help beside the badge says how to turn them on. Every source with text has one line saying what it is and what can be done with it, and all source editors start at the same height. (#101)
- A writable source is edited in place, without an Edit button. Typing, pasting or tapping in a read-only source shows one notice with the reason. (#101)
- When a save finds that the file changed on disk, the source card, the modules and the quick setup show an alert and wait until the draft is kept over the change or discarded; previously, the draft was applied to the changed file without warning. A module draft carries over on its own when the change is outside its section. (#118)
- Read-only code editors show no caret or current-line highlight; the line a source was opened at keeps a marker. (#97)
- The must switch in the new-rule dialog reads Lock this outbound, with a line explaining what a locked outbound skips. (#91)
- The outbound mode card and the Arrange review label their button Apply and reload, as Configuration does, since all three write the configuration and reload it. (#126)
- Below 600 pixels wide, tables keep every column at its minimum width and scroll sideways, instead of dropping columns until the rest fit. Wider screens drop columns as before. (#128)
- On Policies, a large node group lays out its tiles like a small group: the same columns, tile width and edges, with room left for the scrollbar. (#125)
- The busiest-host tile on Connections takes two shares of its row. A host that still does not fit keeps its end visible and shows the full name on hover, focus or tap. (#99)
- When a subscription refresh leaves the datapath degraded, the notice says that new connections proxied through userspace are refused and points to Overview. (#98)
- The Chinese token sign-in heading and missing-token message use formal wording. (#107)
- README screenshots are rendered by the documentation site on each deploy and are no longer stored in the repository. (Zakkaus/doona-docs#6)
- NOTICE, `REUSE.toml`, the READMEs and the `OFL.txt` shipped with the fonts name Adobe as the copyright holder of Noto Sans TC and SC. The documentation site credits Adobe for the Spectrum icons, fonts and design. (#122, Zakkaus/doona-docs#12)

### Fixed

- Errors with the reused codes `invalid_request`, `unsupported_value` and `state_conflict` keep the backend's own message beside the summary. (#94)
- A backend that never answers no longer leaves a page loading. API reads fail when the headers, or the next part of the body, take more than 15 seconds to arrive, and writes when they take more than 30; the event and log streams keep their own limit. Sign-in and sign-out time out the same way. After a read timeout, Retry fetches the data again. A write timeout says the change may have been applied and asks for a reload before trying again. (#104, #118)
- Apply and reload is disabled when a refetch makes the open source read-only. Undo after Cancel no longer restores the discarded edits. (#101, #106)
- The must switch in the new-rule dialog aligns with the outbound picker. (#90)
- A connection opened by its link unfolds its collapsed group, and so does a selected connection that moves into another folded group. Outbound groups no longer unfold when the language changes, and an outbound named like a built-in label keeps its own group. (#93, #118)
- When an ordinary rule precedes the must rules in the routing block, doona's refusal to switch the outbound mode says to move the must rules to the top and names the rule. (#103)
- Trace field errors wait until a field is filled. Chrome no longer reports `apple-mobile-web-app-capable` as deprecated. (#103)
- Help buttons and status lights align with the centre of their text. (#98)
- Logs and the flow distribution say when the configuration forbids their recorder. Test all no longer blames TCP probe support when it is unavailable for another reason. (#98)
- The minimum password length applies only to the administrator password created at setup, not to signing in. (#107)
- A failed suspend or resume shows its translated message again (`lifecycle_failed`). (#115)
- Overview no longer gives honk's causes and fixes for resources an older backend leaves out of its capabilities; they are listed as not provided by the build. When another engine gives no reason, a read-only main configuration no longer claims one. (#118, #132)
- A read-only source is labelled as containing secrets only when its text defines a `native_api` or `clash_api` block; otherwise it shows as read-only. (#118)
- The health-check URL dialog sends only the fields that were edited and offers the check settings that the group's `mutable_config` lists. A save no longer replaces a change another client made to the same field: it fails as a conflict and the dialog stays open. (#106, #118, #132)
- The new-source dialog warns that a path is not included only when no loaded file includes it, and resolves include patterns from the main configuration's directory, as honk does. (#118, #131)
- A geodata update whose result cannot be confirmed is shown as unknown, not as failed. (#106)
- A new source whose read-back fails stays created, and a late result no longer reaches a reopened new-file dialog. A selected diagnostic stays selected across polls. In the demo, a new source whose name has a space, a non-ASCII character or `?` opens once created. (#106)
- The demo refuses source writes over honk's size limits, a second create of the same path and a create past the source limit, as honk does. Demo sign-in works over plain HTTP on a LAN address, where browsers do not provide `crypto.randomUUID`. (#118, #124, #131)
- The DNS device filter error appears under its field and is read with it by screen readers. The DNS log's time column fits relative times. (#105, #106)
- The note on the Arrange tab of Policies no longer mentions an Add menu on each row; it points to Add to group below the list and to Review and apply. (#111)

### For contributors

- CONTRIBUTING describes the architecture and the import allow-lists, and lint enforces the engine boundary. (#123)
- `tools/honk-commit.txt` pins the honk commit a release bundles; the release workflow fails unless honk's `debug` release, its target and its source tag name that commit. (#117)
- The API contract is pinned at api-standardize 3640713. (#116)
- The store, the configuration page, the engine explanations, the sign-in outcomes and the connection test were split into smaller modules, and unused code and duplicate strings were removed, without changing behaviour. (#108, #119, #120, #121, #126, #129)

## [0.1.0-beta.7] - 2026-09-27

### Added

- Overview shows the backend process's CPU usage.
- Connections shows each connection's upload and download rates, calculated from successive samples.
- Policies lets you edit a group's health-check URL.
- Configuration can create a new source file when the backend supports it.
- A failed first fetch of a new subscription offers Retry in its toast; a new build offers Reload. Toasts with actions remain until dismissed or used.
- Settings lets you place notifications at the top or bottom, centred or aligned to the end.

### Changed

- Toasts keep their status colours and separate the summary from backend details. Show all and action buttons share a footer on desktop and phones; request IDs stay in the console instead of the toast.
- Desktop tabs are 34 pixels tall, name lists use consistent sorting, and equally sized connection filter groups keep a stable order.
- Configuration shows module sections from read-only includes and groups repeated diagnostics.
- README screenshots reflect the current desktop and phone layouts in all three languages.

### Fixed

- Configuration completion reads groups from every source and preserves each group header's original quotes. Quick setup preserves the same names in generated routing rules.
- After a conflicting source save, the editor keeps the draft and uses the refreshed source as its next save's base. Reloading clears validation results from the previous generation.
- Activity finds the outbound mode line by its marker rather than its position in the file.
- DNS rejects an invalid device address without dropping the last valid filter. Closing one connection no longer clears another connection opened while the request was pending.
- The routing map waits for its nodes before settling. Connection rates discard baselines from lists no longer held by the store.
- Retrying a refused event stream reconnects it, recovered capability errors clear, and a refused first-page request is not repeated without a cursor.
- Settings can sign in again after signing out, distinguishes a rejected token from a connection failure, and reports unavailable session storage as a storage error.
- Geodata preset changes ask for confirmation when they lack categories used by the configuration. Operation errors identify the failed stage when the backend provides it.
- Paused logs show the held record count. Gap summaries omit a zero dropped count, and Activity notice summaries align in one column.
- Long backend versions end with an ellipsis; available backend capabilities use a status dot.
- A pending keyboard navigation prefix clears when the filter shortcut has no field to focus, and near-viewport content keeps its observer across callback changes.

## [0.1.0-beta.6] - 2026-09-26

### Added

- The side navigation shows the connected backend's name and version with a connection light. It opens a card with the connection state, API, build and backend URL, and buttons for About doona and for editing the backend in Settings. On phones the same card opens from the overflow menu.
- About states that doona talks only to the backend it is connected to and sends nothing elsewhere.
- Settings offers a mirrored layout for left-handed use.
- A right-to-left language lays the page out right to left; adding one needs only its catalogue.
- Node latencies carry a green, yellow or red dot, which keeps the tone visible in palettes that show latency text in the body colour.
- Hovering or tapping an Activity sparkline shows the sample's value and time.
- On touch screens, a tap reveals the full text of a truncated table cell.

### Changed

- On phones, the Connections filter field takes the toolbar row and the other filters fold into one menu.
- On phones, the busiest connection takes a row of its own, and a host too long for it keeps its end visible.
- On small phones, key-value facts use two columns, truncated drawer values wrap, table row actions stay reachable, and the column resizer is wider.
- On phones, the Activity node picker stays inside its tile, custom geodata URL fields use the full width, and the subscription remove button stays on its row.
- On short landscape phones, the top bar scrolls away instead of covering the page.
- A tab bar that overflows scrolls the selected tab into view and fades its cut edge.
- The Arrange hint no longer says the tray is on the right when it is below the groups.
- Heatmap time marks are larger.
- Translations use one term per concept, the English copy is tidier, several mistranslations are corrected, and Simplified Chinese distinguishes blocking from DNS interception.
- CONTRIBUTING describes how to correct a translation and how to propose a new language.

### Fixed

- A routing trace simulates the first IPv4 and first IPv6 answer and shows the full resolution, instead of refusing a name with several addresses.
- Buffer overflow gaps no longer appear on the Activity home card; Events still lists them.
- A configuration write the backend accepted is reported as unknown, not failed, when the following status poll fails.
- The add-rule dialog preselects no outbound until the groups are read, instead of showing a wrong one.
- Donut charts with more than sixty slices no longer draw a slice with a negative angle.
- Chart tooltips are announced politely, so moving through a chart does not interrupt the screen reader.
- A gap summary that names no record starts at its reason instead of a dash.
- Chart tooltips stay inside their card on narrow phones.

## [0.1.0-beta.5] - 2026-09-26

### Added

- Settings shows geodata presets, custom source URLs, automatic updates, a download route and update status when the backend supports them.
- The Connections Traffic tab shows node latency, including P50 and P90 across nodes and which nodes carry current connections, when health data is available.
- When rules are writable, connection details can create a routing rule from the destination and apply it immediately or hold it for later. A matched-rule link opens the rule list.
- The add-subscription dialog offers the refresh interval, User-Agent and cache option when the backend advertises them.
- Navigation groups pages into Overview, Traffic, Routing and Settings hubs, with a bottom bar on phones.
- The top bar has a separate reload action and shows the number of held rules to apply.
- Settings shows manual installation steps for Safari on iPhone and iPad, and Safari 26 or later on macOS, when no install prompt is available.

### Changed

- Until a language is chosen, doona follows the browser's first language preference; a saved choice still takes precedence.
- The Connections and flow records tables show the final node or outbound instead of the full chain. Details and CSV export retain the chain, a tooltip shows the path when a group precedes the node, and a saved hidden column stays hidden.
- Geodata settings save as they change. Custom URLs remain editable when their initial values came from the configuration file; restarting honk can restore URLs named in that file.
- Segmented controls that do not fit become a picker instead of scrolling or clipping.
- On narrow Activity tiles, sparklines sit below the value and use the tile width.
- On phones, top-bar options use submenus, and longer page action groups move extra actions into a menu.
- Initial page loads download less shell code, and visitors using a real backend no longer download demo code for offline use.
- Activity charts download less JavaScript. In measured large-list scenarios, node searches and probes, connection sorting and selection, and log bursts use less scripting time.
- The README includes a page tour and phone guidance, and demo links point to https://demo.daeuniverse.org/.
- Internal restructuring of charts, shared components, routes and styles leaves the UI and behavior unchanged.

### Fixed

- Restart-only configuration refusals name the affected settings, and a file written without a successful reload is reported as unapplied.
- Repeated configuration conflicts explain when the file on disk differs from the running configuration.
- Runtime settings refresh after activation, and retries no longer replay writes without an idempotency key. Configuration validation and routing traces, which write nothing, still retry after a temporary refusal.
- DNS statistics stay usable when a log page is refused for size. Failed reads show one retryable error, and early-ended pages show how many records loaded without assuming why they ended.
- Close all handles connection sets above the backend's bulk limit in batches and reports connections left open when a batch stops.
- Configuration validation and writes report the advertised size limit before sending an oversized request.
- Relative times and traffic and memory chart windows use the backend host's observed time when it is available.
- Event and log streams reconnect after missed heartbeats. Gaps from expired cursors are marked, including in exported logs.
- Unknown operation and probe results are shown as unknown instead of failed or unreachable; new backend enum values are shown instead of blank labels.
- Policies, fallback groups, recorded log levels, delayed retries and degraded subscription refreshes are described according to the backend's actual behavior. Known backend error codes have translations.
- Module diagnostics stay in place while typing and when switching sections, and code scrolled sideways no longer shows through the line-number gutter.
- Password sign-in works with the backend's public discovery response.
- The demo's traffic history advances with time, so Activity charts retain a full recent window after a tab has been in the background.
- The demo keeps refused settings patches atomic, updates required geodata categories after configuration changes and redacts secret-bearing parts of geodata URLs.
- Connection rules can be placed before the earliest writable rule. Rule creation waits for groups to load, and the matched-rule link remains available on read-only configurations.
- A rule value containing parentheses or `&&` is refused, because honk would read it as rule syntax.
- Held rules cannot be discarded or applied concurrently while an apply is running. Written rules leave the pending list even if reload fails or its result is unknown, and partial results count every written rule.
- Geodata controls follow backend capabilities, including older backends without download-route settings. Custom URLs cannot be edited while saving, so later input is not lost.
- DNS cache usage is read again after a flush or deletion; an older cache walk cannot restore stale usage afterward.
- Chart arrow keys keep working after the data shrinks. The Outbound downloads chart has one named keyboard stop, and its tooltip no longer sits under the centre total.
- Keyboard focus stays on a segmented control when resizing switches it between buttons and a picker.
- On phones, the bottom bar and the hub page switcher replace the history entry, so Back no longer retraces every tap.
- An arrow key pressed right after a phone submenu opens is no longer undone.
- A popover opened near the right edge keeps its width instead of shifting while it is placed.
- Screen readers announce a retry wait once instead of every second.
- A failed node read shows an error in the Connections latency card instead of silently removing it.
- Table columns and page width stay steady while rows load, tables change layout or pages change height.
- Table lines, row hover and other quiet fills stay visible on cards in the Rosé Pine dark, Nord and Kary palettes, and touching a chart point no longer leaves a hover state stuck.

## [0.1.0-beta.4] - 2026-09-24

### Added

- dae text outside the editor is highlighted with the editor's colours, in policy arrangement, rules, the configuration wizard, configuration issues and flow details.

### Changed

- Release assets carry the upstream version without `v`, and each package keeps its own format's version inside: `0.1.0~beta.4-1` for deb, rpm and ipk, `0.1.0beta4` for Arch.
- The API contract is pinned to the upstream api-standardize `honk` branch, which now includes rule sources named by id, recorder modes, password sign-in and DNS cache usage.
- Package recipes list every architecture and declare the licences of the bundled npm packages; the Gentoo ebuild maps alpha, beta and rc versions to their tags.

### Fixed

- The outbound mode card shows the current mode, read-only with the reason, when the main configuration cannot be written.
- The dae highlighter no longer colours digits inside names as numbers and keeps an address or CIDR as one number.

## [0.1.0-beta.3] - 2026-09-24

### Added

- A public demo on GitHub Pages with sample data from the built-in mock backend.
- A clear message when an engine has no native API, instead of a token prompt.

### Changed

- Releases no longer include a node_modules archive; package recipes install the prebuilt tarballs.
- The READMEs and guides state which honk builds serve the native API and lead with password sign-in.
- Card values keep secondary facts on a caption line, cards in a row stay equal in height, and the capabilities list uses columns.

### Fixed

- An updated build could miss the page language for offline start.
- The Events page left out events received before it opened.
- Layout on tablets and phones for Overview, DNS, the routing map and other pages.
- Sticky table headers and overlays showed content through them in the glass palette.
- Untranslated datapath errors and the rule editor's must switch.

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

[Unreleased]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.12...HEAD
[0.1.0-beta.12]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.11...v0.1.0-beta.12
[0.1.0-beta.11]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.10...v0.1.0-beta.11
[0.1.0-beta.10]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.9...v0.1.0-beta.10
[0.1.0-beta.9]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.8...v0.1.0-beta.9
[0.1.0-beta.8]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.7...v0.1.0-beta.8
[0.1.0-beta.7]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.6...v0.1.0-beta.7
[0.1.0-beta.6]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.5...v0.1.0-beta.6
[0.1.0-beta.5]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.4...v0.1.0-beta.5
[0.1.0-beta.4]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.2...v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/Zakkaus/doona/compare/v0.1.0-alpha.2...v0.1.0-beta.1
[0.1.0-alpha.2]: https://github.com/Zakkaus/doona/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/Zakkaus/doona/releases/tag/v0.1.0-alpha.1
