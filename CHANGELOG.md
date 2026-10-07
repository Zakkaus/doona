# Changelog

This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Entries live in [changes/](changes/) until release.

## [0.1.0-beta.18] - 2026-10-08

### Added

- Nodes show the configured stream transport when the backend reports it, including XHTTP. (#524)

### Fixed

- Bundle honk only after the standalone doona release is public, and require its embedded UI version, revision and program hash to match that release. (#523)

### Internal

- Update Alpine, OpenWrt, Nix and Gentoo source checksums from the beta.17 release archives. (#522)

## [0.1.0-beta.17] - 2026-10-07

### Changed

- Group editors start with the region checklist collapsed and keep selected region tags visible. (#516)

### Fixed

- Glass notifications overlap in a collapsed stack and expand into readable cards. (#519)
- Manual node grids show a keyboard focus outline only on the focused node, even when another node retains a stale focus-visible attribute. (#520)
- Policy node selection borders update immediately during rapid switches. (#518)
- Rule template info buttons sit directly after the title, with descriptions beneath it. (#517)

### Internal

- Update source package checksums for the beta.16 release archives. (#515)

## [0.1.0-beta.16] - 2026-10-07

### Changed

- Liquid Glass Events and Logs tables omit the lens refraction and rim to reduce scroll rendering work. Their blur, saturation and brightness remain. (#512)

### Fixed

- Streamed Events and Logs tables no longer push the page back down while you scroll up with the wheel or by touch; reading-position anchoring resumes once scrolling settles. (#510)
- The demo Events and Logs tables open with 200 records each at their default filters, providing enough history to try scrolling. (#510)
- The widget gallery's scrollbar in the three-column Edit widgets dialog no longer touches the widget cards, and the cards stay visible after scrolling. (#511)
- The preview in the three-column Edit widgets dialog no longer shrinks and grows repeatedly when its column is only a few pixels taller than the dialog. (#511)

- DNS cache matching controls filter the displayed entries and keep bulk deletion aligned with the results. (#514)
- Empty Glass tables use the table's material without an extra background behind the empty message. (#514)
- Glass palettes show the selected state of the panel pin and widgets buttons, including while hovered. (#514)
- Login and administrator setup show permission refusals without incorrectly attributing them to the client's network address, and retain the backend request ID. (#514)

### Internal

- Refresh Gentoo and Alpine checksums for the published 0.1.0-beta.15 archives. (#508)

## [0.1.0-beta.15] - 2026-10-06

### Added

- The Glass section of the palettes offers four materials over a wallpaper with colour and shapes behind it. Liquid Glass follows Apple's Liquid Glass: in Chrome and Edge the cards, the phone's bottom bar, the floating panel, dialogs, menus and toasts are clear glass that bends the page at their edges and catch light on their rim. The sidebar floats as one more card, and the top bar draws no strip: its search field and buttons are glass capsules, with a soft blur under them once the page scrolls. Glass is the same material with blur and fill only, as Firefox and Safari draw Liquid Glass; the palette menus note that Liquid Glass refracts only in Chromium browsers. Frosted draws one even blur on every surface, so the shapes behind stay softly recognisable. Tinted follows Microsoft's Mica, with nearly opaque surfaces and no blur. (#471, #488)
- Every Glass material has a soft shadow in place of the dark outline, with no line drawn round its edges, and Reduce Transparency, Increase Contrast and forced colours turn each one solid with clear edges. A Glass material chosen with the earlier Settings switch carries over to its palette. (#471)
- Settings > Appearance can replace the Glass palettes' wallpaper with an image of your own, and Use default brings the built-in one back. The image is scaled to at most 2560 pixels on its long edge and kept only in this browser's IndexedDB; the app shell and the login page both show it. (#477)
- A readability veil, on by default, lays white in light mode or black in dark mode over the image, with a Dim slider up to 60%. At its default of 60%, label and secondary text keep 4.5:1 over any image. Turned off, the image shows as it is. (#477)
- A Blur slider in Settings > Appearance scales every Glass and Frosted surface's blur from none to 150%, with or without a custom image; below 100% the surfaces' fill thickens so text keeps 4.5:1. It is kept in this browser with the palette and applies before the first paint. (#477)
- The Logs and Events tables have a Copy record button on each row, which copies the row as the page exports it. (#470)

### Changed

- The installation page lists every release file with what it is and who needs it, and the pages and themes docs describe the sign-in page's Language, Palette and Theme controls. (#464)
- The program archive is smaller: NOTICE links the Creative Commons licences instead of shipping their texts, and THIRD-PARTY-NOTICES.txt prints each licence text once with every package and copyright line it covers. (#466)
- CHANGELOG.md is no longer in the program archive; the deb, rpm, pacman and ipk packages install it in their documentation directory. (#466)
- Global settings edits the transparent proxy and profiling ports in a number field with decrease and increase buttons, and a port reads 8080, not 8,080; clearing the field still writes it as unset. (#472)
- Runtime recording limits, a policy group's check interval, tolerance and idle timeout, the routing trace's ports and DSCP, and a custom subscription interval are number fields too; Enter in the sign-in form, the runtime settings card and the new-source, node, subscription and check dialogs does what their main button does. (#472)
- The sign-in page is one centred card over the theme background on every screen size, and the mini game beside it is gone. (#473)
- Palettes are picked from swatches: Settings > Appearance shows each palette as a box with a small window drawn in its light and dark colours, and the palette menus in the top bar and on the sign-in page list one plain line per palette. The palettes alone in their family are listed together under Other. (#491, #495)
- Tables show placeholder rows at the real row height under their header while the first data loads, instead of a spinner. (#474)
- Every first load whose shape is known now shows a placeholder in that shape and size: each page's own tabs, toolbars, cards and tables while it opens, the Activity dashboard's saved cards, charts, rankings, settings forms, lists, fact strips, widget readings and flow details. The spinner stays for sign-in, search and pending buttons. (#474)
- Buttons follow Spectrum 2's split: everyday actions use the action-button shape (8px corner, medium weight), while dialog footer actions, form action rows and accent and negative buttons are bold pills; secondary buttons have a 2px outline, negative buttons are filled, leading icons are larger, and keyboard focus shows the hover colour. (#469)
- A button waiting on the backend shows a spinner in place of its label after one second and keeps its size. (#469)
- The source editor keeps Validate, Cancel and Apply on their own row, above the find, go-to-line and command tools. (#469)
- Page tabs and the Policies kind switch are drawn at M again, 32px with 14px labels like every other segmented control, and the New group button beside the switch is M. (#467)
- Only the Glass palettes download Glass's styles and wallpaper code, so every other palette starts about 4.5 KB lighter. (#494)
- A configuration refused because a file it needs is missing, such as geoip.dat or geosite.dat, now says which file in plain words. The routing mode dialog repairs a geodata file the backend has loaded with Download geodata, and otherwise links to the docs on installing geodata, since a geodata update replaces only loaded files. (#496)
- Policies and Nodes open faster, and Logs keeps the space of its activity chart while the stream opens, so the list no longer moves down when the first records arrive. (#475)
- Config loads its code editor with the source tab instead of with the page, and draws the editor's Skeleton until it arrives. (#479)
- The sign-in page no longer downloads the signed-in frame: the top bar, sidebar, hub bar, shortcuts and widget host load with the Activity page, at startup when the tab holds a credential or runs the demo. (#482)
- Policies and Nodes no longer redraw every card and row when a poll brings only new probe times; a card or row redraws when its own nodes change. (#478)
- A Latency tab kept open behind another stops recomputing until it is shown again. (#478)
- Settings puts Appearance on a tab of its own, beside General, with the palette boxes always shown; links and search hits for an appearance setting open that tab. (#495)
- The top bar and phone palette menus end with an Appearance settings row that opens that tab. (#495)
- The rules page loads the trace simulation when its tab is pointed at, focused or opened, so the page itself downloads about 13 KB less. (#492)

### Fixed

- Reloading or leaving the page no longer cuts off reads in flight, which Safari reported as access-control errors. Declining a draft's leave prompt sends those reads again, and saves in flight are never cancelled. (#483)
- Typing a number below a field's minimum on the way to a valid one, such as 128 in a field from 64, keeps the typing instead of snapping it to the minimum; whole-number fields no longer take a decimal point. (#480)
- A page that replaces its Skeleton twice in quick succession keeps its scroll height until the latest swap settles. (#480)
- Enter in the profile name, custom geodata URL, rule condition and expression, quick rule and routing template dialogs does what the dialog's main button does. (#480)
- A global setting no longer swaps between a number field and a text field, and loses focus, while it is edited. (#480)
- Copying on a plain-HTTP address returns keyboard focus to the control that copied. (#480)
- The global settings tab, the Logs chart, the policy cards and the node table's provider line draw their first-load Skeletons through the shared parts: the delay, one hidden status and the loaded height. (#481)
- A chunk that fails to load no longer flashes the update message on the page that is already reloading itself; the message comes up only if the reload is cancelled or not allowed. (#481)
- In the Glass theme the page content is visible again when doona runs in an iframe with rounded corners, such as the luci-app-honk dashboard; Chrome and Edge drew the frosted chrome over the whole content area. (#468)
- A page change made while doona is still starting up is no longer lost, so the address and the page shown stay in step. (#493)
- A password sign-in now lasts until you sign out or honk ends the session, instead of ending when the tab closes. (#499)
- While a dialog is open, toasts show at the top centre of the window for every position setting, and the dialog starts below them, so a toast no longer covers the dialog's heading, Apply or Cancel buttons. (#485)
- When the backend refuses a routing mode, its dialog stays open and lists each validation error with its line instead of a toast without detail. (#486)
- A subscription URL typed without a scheme gets `https://` added when the field loses focus and when it is saved. (#487)
- An unusable subscription URL or node link is explained under its field, not only in the disabled button's tooltip. (#487)
- A dashboard row of one-line cards is measured again when a web font finishes loading, so each card keeps the width its line needs in that font rather than the fallback font. (#490)
- The Run trace button sits level with the input boxes while it is disabled. (#484)
- Switching between the Connections and Events pages no longer makes the browser tab run out of memory. Each switch reopens the event stream, and the event that opens it shares its id with the event before; the Events table and the notices now tell such events apart. (#502)
- Live tables release old rows as new data arrives, keeping memory use bounded. (#503)
- The line above the Appearance settings row in the palette menus no longer touches the row, so its focus ring stays clear. (#498)
- Activity measures control-card widths after font-driven label updates are committed, so the first row keeps its final proportions when fonts finish loading. (#506)

## [0.1.0-beta.14] - 2026-10-04

### Added

- The DNS cache can list expired entries, and the geodata details show when the files were last checked and when the next automatic check is due. (#430)
- A date format setting next to the language. Automatic, the default, writes dates in the order of the browser's region, so an English interface in an Australian browser shows 27/10/26; Day/Month/Year, Month/Day/Year and Year-Month-Day override it. (#450)
- The optional `doona-precompressed` package and archive install `.br` and `.gz` copies of the text assets next to doona's files, so servers can send compressed responses; the main package stays the same size. (#449)
- Releases include Alpine and OpenWrt 25.12 apk packages for doona, doona-fonts and doona-precompressed, with the public signing key of each release. (#449)
- A time format setting next to the date format. 24-hour is the default; 12-hour writes AM or PM in the interface language's own words (4:27 PM, 下午4:27); Automatic follows the clock of the browser's region. It applies to every time on a page, including the chart axes and the log heatmap, and composes with each date format. Source cards, the log and event time columns and the log heatmap give a 12-hour time the room it needs instead of cutting it short. (#453)
- Activity's traffic chart and the Connections traffic view explain, beside their titles, that direct connections the kernel forwards on its own are not counted, when the backend reports only userspace traffic on an eBPF datapath. (#442)
- A meter in the widget kit, following S2's Meter: it reads as its value text to assistive technology. (#444)
- Source health shows a meter under each source whose provider reports a traffic allowance. (#444)
- A Subscription quota widget lists each subscription with its quota meter, or its usage when no allowance is reported, and its expiry. It is offered in the dashboard and panel galleries and is not in the default layout. (#444)
- The memory widget's key-value form meters cgroup usage against the limit when one is set, and names OOM kills once there were some. (#444)
- Outbound failures, node availability and DNS latency widgets for the dashboard and the panel, offered in the widget gallery. (#440)

### Changed

- The READMEs are shorter: installation, package choices, pages and themes moved to pages under `docs/`, in English, Simplified and Traditional Chinese. (#461)
- System status meters the cgroup memory usage, and the DNS cache card its usage against the entry capacity, as S2 meters with a name and a value text that assistive technology reads. A zero limit or capacity shows no meter. (#455)
- System status cards hold their place with S2 skeletons while their data loads, and loading notices turn an S2 progress circle instead of the spinner. (#455)
- The node sources are cards instead of a table: each card lists its kind, state, node count, update times and expiry, and closes with its usage, metered under the value when the source has an allowance. The arrow keys move between the cards and select the source whose nodes are listed below. (#447)
- Dates and times default to a 24-hour clock in every language, with the date in the language's own order. A source card shows its expiry to the minute, with the seconds in its tooltip. (#447)
- Page tabs are drawn as the segmented control at the large size: 40px tabs with 16px labels in the same filled track and sliding selection, so they stand apart from the medium controls in the page below them. (#457)
- A wide list widget with four rows or more lays its rows out in two columns, and the notices card grows with its notices instead of taking a row count. (#432)
- List widgets wrap a long name onto its own line instead of cutting it off. (#432)
- Donut widgets from two thirds of the dashboard draw a larger ring with a narrower legend, node latency puts its lowest and highest values on the legend line from half width, and the narrowest panel keeps every name whole. (#436)
- The speed widget sets its own choice of one chart or two in its widget settings, per instance, instead of the panel menu; speed widgets and dashboard cards saved split still open split. (#441)
- A chart card two thirds of a row or wider, value tiles included, lists each series' peak and average beside its chart. (#437)
- A sparkline waiting for its second sample draws its baseline, and the speed widget's legend keeps one height while its rates change. (#437)
- A chart card two thirds of its row or wider, including the default traffic card at Auto width, lists each series' peak and average beside the chart, one compact line each, so the figures never stand taller than the chart. (#454)
- Key-value metric cards two thirds of a row or wider list the same statistics beside their readings. (#454)
- Memory can also be a value tile like the download and upload cards, in its sparkline form, from a fifth of a row to full width, with its peak and average on wide cards; its chart stays the default. (#454)
- The panel's medium memory widget shows resident memory and the cgroup's use against its limit; its chart starts at the large size. (#454)
- Memory widgets draw no meter when the cgroup limit is zero or absent, and say the limit is not reported, or that there is none when the backend reports it unset. (#454)
- An open group editor stays open when the group is removed elsewhere, and says the changes were not saved. (#414)
- Light themes write notice badges and warning and info toasts in white. (#451)
- Panel widgets shown as a list of values no longer offer a large size that looked the same as medium. (#417)
- The sign-in page no longer downloads the other pages before you sign in. (#420)
- Node flags are worked out faster when Activity opens. (#410)
- Installing an update no longer downloads files the page already has. (#412)
- Interface strings that name the same thing now share one catalogue entry. (#462)

### Fixed

- One Activity tab no longer reads the capabilities on every runtime heartbeat; they are read once and again only after a generation change, a reconnect or a sign-in. (#426)
- A segmented control, tab bar or side navigation marker slides again to the item a pointer picks, instead of jumping there when the press is released. (#419)
- Reads that come back with an empty body or no response are sent once more before an error is shown. (#421)
- Error details name the failed request and the key response headers. (#421)
- Without the optional font archive, the UI no longer requests the Noto Sans TC and SC files and logs no 404s for them; it checks for the archive once per page load and declares the faces only when it is installed. (#424)
- The Logs and Events pages no longer stutter while records stream in or while scrolling: each update renders the visible rows once instead of twice, and scrolling no longer forces a layout on every scroll event. (#408)
- The sidebar section chevrons and the docked widgets header's menu and collapse icons are drawn at S2's small icon size, the chevrons at the weight of S2's side navigation chevron, so they no longer read faint. (#460)
- An unconfirmed New file result and the normal read-only hint in Global settings are shown as information, not as errors. (#431)
- The Activity notices card folds identical notices into one row with the total count, wherever they fall in the feed; the badge counts distinct notices. (#406)
- A flow gap that names no record reads "Flow records lost: recording changed" instead of repeating the reason label. (#406)
- Stream ready events stay on the Events page and no longer appear on the notices card. (#406)
- Paragraphs in a dialog are spaced by the dialog alone, so the routing template dialog no longer leaves wide gaps between its sentences. (#456)
- The Nodes page puts its lead line beside the source actions instead of leaving an empty toolbar row above the cards. (#456)
- The floating widget panel can be resized down to 200 pixels wide; an unsized panel stays 280 pixels wide. (#405)
- Narrowing the floating widget panel from a side or by keyboard lets it grow as tall as its content needs, up to the window, so the mode switch and Apply are no longer cut off. (#405)
- In the Glass theme the floating widget panel is frosted with the regular glass fill and blur, so the page behind it no longer shows through readably. (#405)
- Dragging a floating widget panel's top or bottom edge no longer makes the panel jump to its tallest height when the pointer drifts sideways. (#429)
- A pinned widgets panel stays in place: it can no longer be dragged, moved by arrow keys, dragged onto the sidebar or resized until it is unpinned. (#459)
- The widgets panel now starts unpinned. (#459)
- The docked panel drops its title and has an Undock button where the floating panel has its pin; the menu no longer offers Undock. (#459)
- A byte fraction writes a unit both sides share once, as in 70／268 MB, so the docked memory meter, now labelled cgroup used, fits on one row. (#459)
- A narrow collapsed panel shows both rates whole beside its buttons. (#459)
- The handle of a panel hidden at an edge keeps the header's spacing and the control's padding around its rates. (#459)
- Member tiles on the Policies page share one column width across groups: a group with fewer members leaves the rest of the row empty instead of stretching its tiles, and long member names wrap instead of being cut off. (#439)
- A member that is itself a group shows a latency on the Policies page: the parent group's own sample for it, or else the latency of the node its current selection resolves to. (#439)
- Controls are back to their S2 sizes: segmented controls, page toolbars, tab rows and the mode card are M (32px) again instead of a forced 40px, icon buttons in table rows lose the stray side padding, and any control that asks for L gets L text and corners. (#427)
- A waffle chart stacked above its legend is centred in its card instead of leaving the space beside it empty. (#458)
- The widget editor's preview scrolls on its own beside the library and the settings, so a long preview no longer runs past the dialog. (#399)
- Donut legends on narrow cards and in the floating panel keep each name on the line of its value and share, and the large panel size shows every entry without scrolling. (#416)
- The small notices widget in the floating panel takes the whole row, and the small node latency widget lists names and values instead of a plot too narrow to read. (#416)
- Node latency names in the floating panel are no longer cut off. (#416)
- Area charts on the narrowest cards drop time labels that would overlap. (#416)
- Dashboard cards offer only the widths and heights their content fills: cumulative traffic and the DNS answer and network splits go up to half width, the group switch up to two thirds, and the two splits list every category instead of offering a row count; a stored width or row count no longer offered reads as the nearest one. The group switch no longer repeats its title. (#428)
- At exactly 600px wide, pages use the same layout as at 601px instead of mixing the phone padding and wrapping with the wider layout. (#418)
- A segmented control that collapses into a picker and expands again gives focus back to its selected option in WebKit. (#452)

### Internal

- Contributors add per-PR changelog fragments; release tooling resolves PR numbers and collects entries without conflicts in the shared changelog. (#364)
- CI exempts test- and documentation-only changes from fragment requirements without changing check lanes, validates committed fragments with the release parser, and release tooling preserves literal replacement tokens in entries. (#364)
- Drop comments that restate the code or narrate history, and correct a few that no longer match it. (#448)
- Caption line heights and the switch gap read the existing spacing tokens, and overridden or repeated stylesheet declarations are merged. (#445)
- `pnpm check:size` budgets the login and Activity startup paths, startup CSS, one language catalogue, one font stylesheet, each page, the config editor and the mock, instead of capping the total, which is now only printed. (#409)
- Drop unused exports, restating comments and duplicate test setup. (#433)
- The screenshot generator captures the beta.13 sign-in, search, dashboard, widget, config, geodata, rules and node views for the docs, and waits for the CPU and latency trends before the activity stills. (#401)
- The API client shares one Retry-After parser and one snapshot refusal check instead of repeating them per call site. (#396)
- Media queries in stylesheets and components use one named breakpoint list in `ui/hooks.ts`, written in a single form and held to the list by a unit test. (#418)
- Each stylesheet is imported by the module that renders its rules: the page header rules join the global page layout, and the widget content and impact list rules get their own files, so a page opened first is styled without another page's chunk; the UI is unchanged. (#403)
- Modules used by a single feature move into that feature's folder; behaviour is unchanged. (#397)
- The design tokens live in foundations.css and the Segmented control styles in their own segmented.css, moved verbatim from motion.css. (#411)
- The group dialog's retry merge is a pure function with its own tests; behaviour is unchanged. (#404)
- The Nodes page dialogs track their late request results with the shared dialog session hook; behaviour is unchanged. (#402)
- The quick add-rule button in the connection, flow and DNS tables is one shared component. (#438)
- The sortable editors share their base and resize grip from sortable.css, and the wide-to-large cell size is mapped in one place. (#413)
- Value tiles and chart placeholders use the `ValueTile` and `ChartWait` kit components, dashboard packing reads `data-pack` marks instead of feature class names, and kit files are named after what they hold. (#425)
- The widget card renderer moves out of the Activity page entry into its own module, and lint keeps the shell from importing that page entry; the UI is unchanged. (#400)
- Widget traits live in one registry entry per widget, and widgets read their surface from a context instead of a flag passed down. (#422)

## [0.1.0-beta.13] - 2026-10-03

### Added

- The widget panel hides its widgets' titles by default; Show widget titles in its menu brings them back. A hidden title still names its widget for assistive technology. (#393)
- The rates widget draws download and upload in one chart on a shared scale, styled like the Activity page's Traffic chart, at the height one of its two sparklines had, so the default widget panel fits without scrolling. Combine upload and download charts in the panel's menu, on by default, switches back to two sparklines. The demo's upload rate swells on its own period, so its curve no longer copies download's. (#393)
- Routing and DNS rules offer visual condition rows with negation, including domain keywords; unsupported expressions retain a text editor. Edits preserve comments, and routing include files support editing and removal. (#257, #273)
- Routing templates can be reviewed as a diff before applying, with existing groups reused. Templates include Back to mainland China and separate switches for ad blocking, QUIC blocking and keeping NetworkManager direct. (#248, #263)
- Policy groups share one create and edit dialog with region, subscription, node and subgroup selectors, draft undo, a default member for manual selection and a final outbound. Compound filters use condition rows where possible. (#233, #262, #278)
- Policies filters groups by manual or automatic selection and folds automatic groups to one line; links and pinning expand the relevant group. (#260)
- Nodes edits writable inline node names and share links in place, updating same-source references and refusing renames referenced by another source. Subscription editing includes interval, User-Agent, cache and download route; an unfetched subscription offers Fetch now. (#238, #249, #281, #353)
- Configuration combines source editing and diagnostics, with persistent global settings in a separate form; module summaries link to each section's editor. Saving validates only changed fields. (#282, #298)
- Configuration offers export, server-file import and revision metadata with confirmed restore when the backend advertises these capabilities. Import reads server startup files, not a local upload. Exports omit listener secrets but may retain other credentials. (#337)
- Latency probe settings saved in this browser choose HTTP, TCP connect or DNS over TCP or UDP, IP family, warm or cold measurement and which group members to probe, including nested groups. Node and group actions use these choices, report supported-method fallbacks and keep HTTP probes for QUIC nodes. Settings links separately to persistent background health checks. (#334)
- Node details show the latest TCP, HTTP, UDP and DNS probe results the backend reports, as latency or a failure reason. (#329)
- DNS queries can choose a configured upstream instead of following `dns.routing`, and can bypass the query cache. (#257, #330)
- DNS cache deletion supports exact names or matching by suffix, keyword, regex and record type, with a matching-count preview when listing is available. Exact-name deletion also works without cache listing. (#306, #314, #355)
- Routing traces accept an optional DSCP value from 0 to 63 to evaluate `dscp(...)` rules. (#332)
- A configurable widget panel floats, snaps to screen edges or pins to the sidebar, and opens as a drawer on phones. Its editor adds, orders, resizes and removes widgets with a preview before saving. Sidebar navigation groups remember their collapsed state. (#265)
- Hide at edge collapses an unpinned, undocked widget panel behind a speed and backend summary; hover, focus or tap reveals it. (#322)
- Search finds Settings fields and actions, persistent global settings, configuration sections and entry points such as Add subscription, New group, export and import, and the widget editor. Labels match in every interface language. A result opens its page, tab or dialog without running anything and focuses the field, or selects the node or DNS rule, it names; exact matches rank first. (#377)
- Dashboard cards take a width (Auto, 1/5 to 2/3, or full width) and a height in chart height or list rows, set in each card's settings or by dragging its edge handles in edit mode. The handles also step with the arrow keys. Resizing one card leaves the others as they were, and value tiles widen their sparkline or put it under the value. In edit mode a dashed box names the space left in a row and takes a card that fits, each card has a remove button with Undo, and the widget gallery adds a widget at a chosen preset size. (#378)
- Activity adds CPU and latency sparklines, with a switch for metric sparklines under Settings > Appearance. Failed latency probes leave gaps, and changing the selected group starts a new history. (#321)
- Activity's latency card follows a policy group's active node, choosing the busiest group automatically or remembering a browser-local group choice; this does not change routing. The picker retains its quiet inline presentation. (#261, #267)
- Activity guides first-run setup through adding nodes, choosing routing and testing latency, then hides the completed or dismissed guide. (#266)
- Settings > Appearance chooses the startup page; explicit routes take precedence. Country flags work on Windows, can be inferred from node names, and can be overridden or hidden in this browser without changing configuration or copied names. (#258, #271)
- Error notices offer Copy error with request, status, code, backend message, request ID and operation. Settings > About copies the last 20 errors, kept only in memory; secrets and request bodies are omitted. (#304)
- Settings > Geodata can reset all configured sources and overrides to built-in defaults after confirmation. (#331)

### Changed

- The deb packages are now `doona-web` and `doona-web-fonts` and install into `/usr/share/doona-web`, because Debian and Ubuntu ship an unrelated `doona` 1.0 network fuzzer that `apt upgrade` installed over the 0.1 deb, deleting the web files. The new debs replace and conflict with `doona` and `doona-fonts` below 1.0. Deb users set honk's `ui` to `/usr/share/doona-web`, and run `sudo apt remove doona` if apt kept the fuzzer. The rpm, ipk and Arch packages and the release archives keep their names and paths. (#390)
- Release archives bundle the honk debug build `debug.2026.10.3.native-api.2` (commit `464c9b3`), fetched from that tag's own release because honk no longer updates a rolling `debug` release. (#369, #392)
- Page toolbars and tab rows use large (40px) controls through the shared component library; cards, dialogs, tables, widgets and the sidebar keep the medium size. Every segmented control is large on every screen, its selected segment fills the control, and controls on the same row match its height. Large controls set their text at the 14px body size. A segmented control too wide for the widget panel turns into its picker. Controls answer a press with their own rounded fill and the S2 press sink instead of the browser's square tap highlight. (#376, #381)
- A dashboard row of Auto control cards gives each card its one-line width first and shares the rest by proportion. Activity's outbound mode, global outbound and status cards stay on one line where all three fit and stack together where they do not. (#381)
- Docked widgets use the sidebar's group header, spacing and text alignment, with captions, legends, values, charts and segmented controls in the section headers' content box. The group boundary resizes the section by pointer or keyboard, and the backend footer aligns with the navigation icons. (#374)
- The default widget panel holds the rates, memory and outbound mode widgets, without the divider. Saved panels keep their widgets. (#393)
- In every widget panel the outbound mode's Apply stays beside the choice while both fit, the choice filling the rest of the line, and otherwise takes the full-width row below it, as in the docked panel. (#393)
- The floating widget panel starts pinned, so it no longer collapses when moving to another page. A panel saved by an earlier version is pinned once, since its stored unpinned state was the old default; unpinning it is kept. Hide at edge applies to an unpinned panel, as before. (#393)
- Settings removes the Backend actions navigation card and moves its geodata files table into Geodata; backend operations remain on their owning pages. The runtime overrides card links to Configuration's persistent settings. (#274, #294, #365)
- Node actions put group choices in an Add to group submenu. Policy labels follow honk's aliases and fallback behaviour in all three languages. Group tags across pages open and highlight the corresponding policy card. (#235, #278, #336)
- Long pickers are searchable, and Connections filters list every device and rule rather than only the twelve busiest. Rule outbound choices list built-ins before groups. (#236)
- Count labels name subscriptions, rules, notifications, connections, nodes and DNS lookups instead of appending counts in parentheses. Numbers, lists and unknown resolve modes follow the selected language. Chinese text distinguishes backend profiles, subscriptions, node sources and configuration files. (#256, #264, #302, #339)
- Menu sections distinguish headings, labels and descriptions, and palette variants use their official names. (#288)
- Events and Logs scroll with the page under sticky column headers rather than inside fixed-height boxes; incoming records preserve the reader's position. (#269)
- The demo uses the regions routing template, with separate node and subgroup counts, and follows honk's configuration writes, recorder demand, retention limits and group identities. (#240, #272, #277, #305)

### Fixed

- A notice or event repeated by the backend keeps its place in the list instead of jumping to the top. (#394)
- The sign-in page has the language, palette and light and dark controls in its top corner again. It takes a token again for a backend that uses one, with a show and hide toggle, and saves it in the profile being signed in to. On wide screens the page stays one window tall instead of scrolling the form down after a resize or zoom. (#380, #382, #389)
- Every routing and DNS rule row with a known config file line has Open config file again, not only rows the visual editor cannot take. The diagnostics list under the source editor has its All, Errors, Warnings and Info filter again, falling back to All when a level empties. (#389)
- In Chrome at 125% or 150% display scaling, the side navigation and top bar no longer shift by a pixel while the page scrolls; on wide screens both are fixed to the window. Page headings keep their height while page code loads. (#376, #388)
- Activity keeps its latency line with the same storage and retention as the CPU history, per selected group and node, so it shows at once after returning to the page or leaving the dashboard editor. A card with fewer than two readings reads the node list again after five seconds, and the demo draws its CPU and latency lines within two seconds of a first visit. (#387)
- Activity's status card uses its feature summary as the View details link when features need attention. Control cards stack labels above their controls rather than cut them, so Global outbound shows its full title, and its picker is as wide as its longest outbound, so choosing or applying one never moves the card. (#384)
- Open action menus keep their items in place when a late configuration read adds an action, so a Remove click cannot open Edit. (#379)
- Keyboard focus rings clear chart legends and list labels and stay inside clipped navigation, menus and tables. Text fields no longer draw doubled rings, and checkbox lists scroll focused controls into view. Source picker labels wrap to keep long file names inside phone screens. (#375, #376)
- The widget editor previews the panel at its real width, scaling it down in narrow dialogs without reflowing or stretching it. A visible grip on the preview's edge, or its arrow keys, sets the width in floating and docked mode. The editor opens with nothing selected, drag handles sit on their row's caption, selection frames keep clear of captions, legends and charts, and newly charted widgets wait for live history instead of showing a sample curve. (#374, #383)
- A collapsed widget panel, floating or docked, shows the live upload rate above the download rate in its header, marked by up and down arrows in their chart colours. The floating panel's list ends one inset from its bottom border, and segmented labels use regular weight so small Chinese glyphs stay legible at 1× resolution. (#374, #383, #386)
- Widget gallery items put their Add button and placed count on their bottom edge, in line across a row. A short dashboard card no longer stretches to the height of two cards stacked beside it, and one card's height no longer changes the others in its row. (#378, #383)
- Connections and Flows rows add routing rules for their own target without a selection, and Flows drops its duplicate detail-panel entry. Disabled actions explain their reason in a tooltip without shifting the buttons, and short status, kind, level, count and time columns fit their labels. (#371)
- Searchable pickers and menus, including the group editor's Groups and Nodes pickers, keep the search field fixed and scroll only the option list within the available popover height, without nested scrollbars or native scroll arrows. Group editor region checkboxes scroll with the dialog body. (#367, #372)
- DNS cache and resolution-log rows open the rule dialog for their own domain through labelled icon actions, falling back to routing rules when DNS rules are unavailable. Cache labels use concise stale deadlines and an unambiguous memory-only notice; Chinese selection prompts use formal wording. (#368)
- Import and restore retain accepted operations with unknown outcomes after closing the dialog or leaving Configuration. Reopening offers recovery without another write; failures retain their backend details in copied errors. (#337)
- Release notices credit Adobe for Noto fonts and name the locale runtime helper. RPMs include all staged licence files, installer metadata declares Twemoji's CC-BY-4.0, `make install` includes dependency notices and cited licences, and `make install-fonts` uses the built Noto licence. (#240, #359, #370)
- Nested policy groups recover probe options when refreshed node IDs arrive after descendant group reads. Trojan, AnyTLS and VLESS retain DNS UDP choices when support depends on configuration, and backend refusals remain visible. (#334, #358)
- Probe failures explain timeouts, cancellations, unavailable addresses and local refusals in all three languages. Empty outbound donuts retain their labels without an empty keyboard tooltip target. (#363)
- DNS regex matching runs in a worker with an execution limit, preventing backtracking from blocking the interface. The limit starts after the worker is ready, not while its script downloads. (#355, #361)
- Renaming a node updates DNS upstream detours in its declaring source and is blocked while another source refers to it. (#353)
- Global settings preserve bare address and URL values when loading and replacing fields. (#355)
- Standalone Global mode outbound controls in widgets and on Activity keep Apply beside the picker, disabled until a change is staged; applying writes and reloads the selection. (#354)
- Routing templates remain available with readable dae configuration when the backend lacks the rules API. Subscription editor links resolve a unique provider by its declared tag, not provider position. (#362)
- After a group-save conflict, retry writes only the fields changed in the dialog, preserving other clients' edits. Conflicting edits to the same field, or a renamed, removed or duplicated group, require reopening instead of writing stale data. Boolean spelling differences do not create false conflicts. Health-check edits also recover from stale revisions. (#237, #241, #362, #366)
- Add to group works from writable includes and retains the shared Policies editor without the runtime groups API. Empty file providers remain visible with status and removal actions. Include-file nodes and subscriptions explain why removal is unavailable. (#315, #333, #353)
- Subscription edits follow honk's syntax and preserve untouched fields, spacing and quotes. Renames update supported same-source group filters; references that cannot be updated safely block rename or removal. Quick setup preserves comments and removes an emptied subscription block. (#238, #245, #249, #315)
- Group filters containing apostrophes open correctly. Member previews accept translatable honk Rust regex syntax; unsupported patterns remain editable as text. (#315)
- Switching the add-rule dialog from Expression to Select reconstructs condition rows when possible; unsupported expressions stay in Expression with a hint. Before the matched rule is offered only for the current rule generation, and rule-hit counts exclude older generations. (#240, #315)
- Configuration write refusals explain the backend's reason. Restart-only changes keep a focused notice on the global settings form or source editor, naming affected settings, confirming nothing was written and giving the host restart command and guide link. (#259, #277, #295)
- Accepted operations whose progress cannot be read report an unknown outcome, not a failure, and reconcile state without repeating writes. Held-rule application continues after leaving its page, and accepted files leave the held list. Refused temporary settings wait for read-back and Retry-After. (#303, #331)
- Saving a source or global settings retains its draft until read-back succeeds and offers Retry on a read error. Reverting runtime settings or subscription edits clears the unsaved state. Switching profile or signing out asks before discarding another form's draft. (#303, #331)
- Password sessions no longer expire according to a skewed browser clock. Signing out also removes saved tokens while retaining the backend address; pairing cleanup no longer restores a token to the URL. An older backend without the native API shows that explanation rather than blaming its token. (#239, #246)
- Same-address navigation in Firefox no longer opens a blank page. Page navigation starts at the top, while in-page tab changes preserve position; hash navigation maintains the history position used by unsaved-draft guards. (#239, #255)
- Failed reads remain visible with Retry above retained data, including Connections' Traffic tab, Activity summaries, DNS statistics and the geodata route picker. Logs avoids duplicate outage banners, and Activity mutes stale runtime figures. Stream recovery respects backend Retry-After. (#241, #244, #252, #331)
- System status asks for confirmation before Reload. Expanded toast stacks collapse on navigation and remain collapsed when returning. (#244, #252)
- Disabled actions explain their reasons without requiring hover, including on touch devices. Long names, domains and rule tokens remain readable; phone toolbars and configuration path pickers retain their labels. (#264, #275, #340)
- Selects and tabs draw one focus ring on the focused control; Glass fields retain their ring. Escape restores row-trigger focus, Home and End navigate tree-table rows, and empty tables expose no unusable resize handles. (#241, #244, #253, #255)
- Phone About dialogs stack their links and scroll between a fixed title and Close button; all dialogs keep their bottom margin above mobile browser toolbars. (#297)
- Table cells and headers use start alignment, including tabular numeric values. Connection group headings span empty columns so counts remain readable on phones, and rule actions retain fixed source, edit and remove slots. (#273, #320, #348)
- Nodes fits whole group tags in its column and puts excess groups behind a +N tag with a full-name tooltip. Policy node grids fill their available width, shrink to filtered results and update marks when switching TCP and UDP. (#275, #289, #313, #320)
- DNS result charts scale to their cards, and cache capacity uses fact tiles. Activity captions fit phone widths, and the routing-map path filter appears above the map. (#276, #289, #293)
- Small action buttons size icons to their text line height. Desktop page tabs fill their 32px bar. Full-name tooltips opened by keyboard focus remain open after the pointer leaves. (#299, #317, #349)
- Partial or degraded refreshes use warning toasts. Warning text and code strings use readable palette colours; light success toasts retain white text, and selected chart points use the palette base colour. (#244, #247, #251, #313)
- Widget panels collapse on page navigation. Full-size widget charts show series legends, connection charts match Activity's colour, and picker accessible names separate labels from descriptions. Widgets skip unavailable outbound usage, and routing maps omit orphan nodes from hidden nested groups. Cancelling the widget editor after Restore defaults moved the panel asks before discarding changes. (#313, #331)
- Chart tooltips dismissed with Escape stay closed across live updates until reopened with Enter or an arrow key. Latency tooltips omit unavailable moving-average rows. Rapid repeated Enter on a drag handle no longer starts a second drag. (#300, #321, #324)
- Oversized event-stream frames end with an explicit error rather than retaining unbounded data. Busy log streams batch record updates while retaining every record in the bounded history. (#290)
- A policy pin that names an unknown stage shows an unknown label instead of the raw value. (#250)

### For contributors

- Page-only code loads with its page, and production builds use Terser to reduce shipped JavaScript. Chart geometry, connection projections and policy-card filters avoid repeated work; hidden views pause unnecessary reads and subscriptions. (#301, #318, #347, #352)
- Noto fonts come from Fontsource packages rather than committed subsets. Development dependencies address security advisories, installs select native packages for the host, and JSX accessibility lint supports the repository's ESLint version. (#270, #310, #351, #359)
- Shared icons, picker helpers, widget families, group editor logic, table projections and ring-history ownership replace duplicated or unused code without changing the interface. (#325, #326, #341, #342, #343, #344, #350, #356, #357, #391)
- Browser CI uses the Playwright image and nine hosted shards, cancels superseded runs and adds nightly coverage and a documentation-only lane. Release building has read-only permissions, separate from publishing the draft. Actions are pinned to current releases, and checks run on arm64 runners. (#254, #279, #291, #292, #309, #335)

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

[Unreleased]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.18...HEAD
[0.1.0-beta.18]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.17...v0.1.0-beta.18
[0.1.0-beta.17]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.16...v0.1.0-beta.17
[0.1.0-beta.16]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.15...v0.1.0-beta.16
[0.1.0-beta.15]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.14...v0.1.0-beta.15
[0.1.0-beta.14]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.13...v0.1.0-beta.14
[0.1.0-beta.13]: https://github.com/Zakkaus/doona/compare/v0.1.0-beta.12...v0.1.0-beta.13
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
