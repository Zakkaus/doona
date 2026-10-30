# Doona lite UI rules

Astryx 0.6.8 templates own the frames; use component props, theme component overrides and documented tokens, not internal-class CSS. These rules apply them to the lite console.
Keep the site theme, Figtree and BrandMark.
Changes must satisfy these rules and the browser checks in the same milestone.

## 1. Page frames and spacing

- Shell: `shell-side-nav` AppShell with `variant="section"`, `contentPadding={0}` and its native mobile drawer. Sidebar and content share the surface background, separated by the native 1 px divider token.
- Page scrolling belongs only to the page LayoutContent (`lite-page-content`) with
  `scrollbar-gutter: stable`. The AppShell main wrapper clips overflow; it must not
  create another scrolling ancestor. Dialogs keep their separate LayoutContent.
- All five pages use `PageFrame`: Heading level 1, one supporting line, actions at the end of the title row, then a single-column body. Draft guidance belongs to DraftBar. No Card around collections.
- Page headers compensate for the actual LayoutContent scrollbar gutter. Header controls, list toolbars and content collections share one right edge. Nodes tables reset inherited container bleed inside `lite-table-inset`.
- `pageRhythm` uses Astryx `table-inbox` inset 4 and control gap 3, plus `settings` section gap 4. The description-to-toolbar gap is token 6 (24 px), with no bottom header padding; toolbar-to-collection and section gaps use token 4 (16 px). The title-to-description gap is token 1 (4 px). Routing and DNS section headings sit above their content.
- Page title is Heading level 1. Outside-card sections are level 2; card titles level 3; subsections level 4. Descriptions use Text `type="supporting" color="secondary"`.
- Titles use 24 px / 600, sections 18 px / 600, and supporting text 13 px. Figtree falls back to system Chinese fonts, with SC first for zh-CN. Headings stay at weight 600 in every locale; Chinese buttons retain their increased weight.
- Related controls use gap 2; forms and section bodies use gap 4. Astryx numeric spacing props are scale keys, not pixels. Custom styles use `--spacing-*`, `--radius-*`, `--color-*` and focus tokens.
- Documented geometry exceptions: template width/height props, Table `pixel()` and proportional minimums, media/container breakpoints, and `ui/metrics.stylex.ts`. SVG coordinates and theme definitions are not spacing. Motion distances are defined only in motion tokens.

## 2. Components and actions

- Primary and destructive buttons share the other controls' 8 px element radius, never pills. Existing borders use the emphasized border token. Ghost and icon-only buttons stay borderless. Segmented controls use size md everywhere: the 36 px frame matches the size md action button and the selected segment sits inset on the track; size tokens stay unchanged.
- Selected routing cards, group rows and segmented thumbs use a 1 px emphasized neutral border and a subtle neutral tint, without an extra ring or selection bar. Selected navigation items use neutral fills and icons. Focus uses Astryx's default accent, never yellow or mustard; decorative artwork and search highlights are neutral, and warnings use orange. Primary buttons use a dark neutral fill with light text in light mode, and a light neutral fill with dark text in dark mode. Destructive actions keep their red tone. Sidebar and content share white in light mode and the same dark surface in dark mode; cards and overlays retain their own surface tokens.
- Same job, same component: TextInput for search, Selector for a scalar choice, Tokenizer/Token for removable values, CheckboxInput for text mode, MoreMenu `variant="ghost" size="sm"` for row actions. Loading text uses `ui/LoadingText`, forwarding Text props while retaining its measured content; its `loadingControl` export supplies overlays through existing control slots without wrapper DOM.
- Settings uses TabList/Tab for narrow panel navigation and SideNav for wide navigation. Keep the package's default overflow handling, tab/panel associations and keyboard focus; disable tabs with `aria-disabled` while validation, review or apply blocks section changes.
- A list toolbar is `CollectionToolbar`: optional search/filter at the start; text-mode toggle and Add together at the end, `gap={pageRhythm.controls}` with whole-control wrapping. Every control uses size md; labels stay on one line. Sort triggers show only the value and retain an accessible Sort label. Search and the first collection row share their start inset. Add is the primary action of that list until a page draft exists; Review changes then becomes the page's only primary.
- Nodes use the table-filter toolbar anatomy: search, protocol Selector, result count and Clear all. CollectionToolbar shows the selected count, clear action and delete action while manual nodes are selected; deletion stays behind confirmation and reference checks.
- Async actions use `isLoading`. When visible text differs from the accessible purpose, set Button `label` to that purpose and `children` to the visible text; the name then stays stable while loading. Destructive writes ask first. Icon-only actions use labelled IconButton plus Tooltip; outline icons use Icon `size="sm"`.
- Tables use `dividers="rows" hasHover textOverflow="wrap"`, `usePaged`, and `usePinnedColumns`. Retain the library's cell padding and internal phone scroller.
- Pinned table columns retain opaque backgrounds and sticky positioning, without start or end edge shadows. `usePinnedColumns` replaces the shadow-tracking `transformScrollWrapper`; no internal-class CSS override.
- Use List/Item for routing and DNS rules, DNS servers and subscription nodes; use RadioList for selecting a group member. Rules show a title, supporting conditions, a trailing target Token, a leading grip and a trailing MoreMenu. Only Nodes uses Table to compare columns. Reset collection edge compensation in `lite-table-inset`.
- Condition Tokens use supporting text size and token 1 block padding. Their labels wrap, including the inner button of an editable Token; toolbar labels stay on one line.
- Initial loading retains the real title, description and disabled actions inside the final Layout frame. ReadState supplies Skeleton rows or cards with token spacing. Refresh keeps current rows, uses RefreshProgress below the header and sets the action pending. A refresh failure retains data and adds an inline Banner with retry. Never show empty before loading finishes.
- Loading toolbars render their final controls from the first chunk frame. Use Astryx Skeleton with product className/style for loading silhouettes, retaining measured text/control boxes and `data-placeholder` for RowEntrance's motion guard. Skeleton counts use the last known collection size for that backend connection, or three when unknown; rows follow pagination limits. Section labels and descriptions stay real text, preserving their wrapped height on phones. The first item, toolbar and header keep their layout boxes from 150 ms through ready and refresh.
- Below 768, Nodes use the table-collapsible compact-cell pattern: name, then protocol/source as supporting text, plus the action column. Subscription node lists show the name and supporting protocol in each row. Names and protocols wrap without clipping. The fixed action column aligns right; placeholders occupy the same control-width slot as MoreMenu.
- Rule conditions use supporting Tokens; the target trails separately. Align row content to the start so every drag handle has the same top inset regardless of a title.

## 3. Motion

- PageFrame calls `usePageMotion(ready)` for every page. Its header enters on mount; body sections enter once on the first ready render. Cached data enters immediately. Refresh, reload, focus return and rerenders do not replay entrance.
- `RowEntrance` surrounds every Table, List, RadioList and semantic list: Nodes, subscription disclosures/node lists, group cards/tiles, routing/DNS rules, upstreams, group panes, member switch and settings lists. It observes until rows arrive, without a timeout. Rows start after the enclosing section; only the first page of rows animates. Sorting, filtering and pagination do not replay it.
- `Crossfade` handles mode targets, text/list views, settings sections and review swaps. Its gap matches the owning section (4). Dialogs enter as one unit through Astryx motion. RowEntrance does nothing inside a dialog; no partial internal stagger. Crossfade still handles explicit section changes after opening. Popovers retain Astryx motion.
- `DraftPresence` slides the draft footer in and out. Closing content becomes inert immediately; animation never blocks navigation or writes.
- Drag/drop and Move up/down/Add/Remove all call the same `animateMove` after updating and focusing the moved item. The helper announces the result; no separate drag animation.
- Durations, easing and distances come from `ui/motion/tokens.ts`: page 360ms, row 280ms, swap/draft/move 240ms. Animate transform and opacity only. Reduced motion makes everything static and cancels active animations.
- Browser verification uses `?slow=600` on the existing mock adapter, never default latency. Assert running body/row animations after data arrives, no refresh replay, and zero animations under reduced motion.

## 4. Dialogs, sheets and focus

- Forms and confirmations use EditDialog (Astryx Dialog, Layout, LayoutContent, VStack gap 4). Footer uses DialogActions: Cancel secondary, explicit primary verb, pending state. Width props are documented geometry, not spacing overrides.
- Groups follow `incident-console`: the group list is a divided List (status dot, name, current member, policy Token, end-aligned latency) and the selected group opens in a resizable end LayoutPanel; below 768 it opens in a tall BottomSheet. Arrow keys move through list rows and member rows; Enter selects immediately. The inspector scrolls inside its panel with a thin stable gutter, so its right edge matches the header. Its member RadioList has no pager: fill the viewport first, then append the remaining rows after paint. Keep the full result count and keyed row focus. 编排 replaces the inspector with the editor: name, policy, All nodes, the table-filter Columns transfer list (grip reorder, add/remove IconButtons, Select all and Restore) and the regex field under the available panel. Every edit stages into the page draft; creation and deletion are the only dialogs.
- Browser checks that assert the final member row (for example End-key focus) wait for the rendered row count to match the inspector's full result count after clearing search; the first visible row does not mean progressive appending is complete.
- Subscriptions use Item inside Collapsible with a start chevron. Name and node-count Badge form the primary line; host and update time support it; StatusLabel trails. Controlled open IDs persist with guarded localStorage. Expanded nodes use a compact List with paging and search above 20 nodes; there is no nested vertical scroll.
- Prefetch node forms on mount, hover and focus, and resolve the component before opening. Asynchronous group editors reserve their final dialog height. Dialog stability checks compare layout dimensions at 50 and 600 ms, separately from Astryx's native scale animation.
- Non-library interactive controls use focusRing's public `--focus-outline-*` tokens, with a negative width offset for inset rings; never remove focus outlines. Opening a page focuses its h1; changes inside a page retain focus.

## 5. Status and copy

- Use StatusLabel/StatusDot and a shared domain map, DateStamp for dates, tabular Text for node counts. No decorative status pulses.
- ToastViewport uses Astryx's `position="bottomEnd"`; transient feedback must not cover page-header actions.
- Keep catalog keys and placeholders identical in en, zh-CN and zh-TW. Taiwan copy uses 節點、訂閱、檢視、儲存. Keep protocol names and dae keywords unchanged. No dot separators or truncated labels.
- All icon artwork comes through `src/ui/icons`: Adobe Spectrum SVGs, currentColor and a 20×20 viewBox. Nodes=Location, Subscriptions=Link, Groups=Layers, Routing=Path, DNS=GlobeGrid, Search=Search, Settings=Settings. Search sits above a Divider; Proxy groups Groups, Nodes and Subscriptions; Rules groups Routing and DNS. Section titles show when expanded; collapsed items retain accessible names, with tooltips on Search and page links. BrandMark uses a 32px Icon without a background, centred on the nav icon axis in both themes.
- SideNav defaults to 224, resizes between 200 and 320, and persists width through its template API. The collapsed footer uses native SideNavItem icons, including one centred backend-status control; all rail controls share the nav icon axis. Native footerIcons holds ColorModeToggle and LanguageMenu beside the collapse control; they stack on the same axis in the collapsed rail. Settings retains its preference entries.

## 6. Enforcement and review

`pnpm check-ui` runs `tools/check-ui.mjs` over source files. It rejects raw layout
div/span, raw px outside documented tokens/breakpoints, non-scale spacing props,
numeric custom spacing/radius/type styles, undefined spacing tokens, auto-fill page grids, duplicate nav
icons or external icon imports, page frames without usePageMotion(ready), lists/tables outside RowEntrance,
and NumberInput with hasClear or hasNumberSteppers (including false).
Theme definitions, SVG artwork and typed geometry are explicit boundaries.
The checker accepts an alternate root for isolated negative controls; tests must
prove each rule fails on a concrete violation. Do not add per-line exemptions.

Static checks do not prove appearance. Inspect all pages and changed dialogs at
390, 1280 and 1920 in both themes; check no horizontal page scroll, text-to-edge
padding, keyboard focus, late data and reduced motion. Keep evidence outside the
repository. Run typecheck, build/import guard, check-ui, round-trip tests and mock
E2E at the completed milestone, then repeat only checks affected by a fix.

## 7. Forms, editors and commands

- Node creation uses the protocol form; bulk links remain a secondary Import action.
  Show protocol-dependent fields, keep less common options under Advanced options,
  preserve untouched link data, and validate with the backend before saving.
- Numeric quantities use NumberInput with bounds and `units` (s, ms, MB). Never set
  `hasClear` or `hasNumberSteppers`; Arrow keys retain native stepping; numberPageStep supplies ten-step Page Up/Down
  because Astryx 0.6.8 only handles arrows.
  Ports use `isIntegerOnly`. Disable wheel stepping in scrolling dialogs. A typed value must make
  Review reachable before blur; NumberInput commits on blur or Enter.
- Edit dialogs offer Reset to original. Reset restores the config name as well as
  field values. Preview and copy actions never write configuration.
- Group choices use stable node IDs and display protocol and source. Group Edit uses
  Groups/Nodes/Subscriptions columns from 1024, tabs below it. Drag and explicit Add
  use the same draft operation; no write occurs before Review changes. Resource rows
  keep text edit, duplicate, form edit and delete in one small ghost IconButton row.
  All four actions use that same page draft; deletion checks references before staging.
  Group cards place their action row below the header so text keeps the full width.
  Group text edits and duplication preserve unmodified fields and use the same draft.
- Text mode loads LiteCodeEditor dynamically. Use Astryx surface, border, text,
  spacing and focus tokens; horizontal scrolling stays inside CodeMirror. Its height
  grows with the document so the page retains the only vertical scrollbar. Syntax
  diagnostics and completion use the same full block as the draft and diff.
- Ctrl/Cmd+K opens Search through Astryx CommandPalette; Kbd explains shortcuts.
  Search indexes groups, nodes, subscriptions, routing/DNS rules and upstreams.
  Enter opens the selected resource, falling back to the first visible result.
  Group results also offer Switch node. Commands remain one section among results. Ignore shortcuts
  while typing or while a visible overlay owns focus. Closed retained dialogs do
  not block keyboard commands. Capability checks apply to palette actions too.
