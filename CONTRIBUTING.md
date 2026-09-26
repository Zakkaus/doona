# Contributing

## Set up

Use Node `^22.13.0 || ^24.0.0 || >=26.0.0` and pnpm 11.15.1. From the repository root:

```sh
pnpm install --frozen-lockfile
```

## Run the gate

Before opening a pull request, run the same gates as CI from the repository root: `pnpm check`, `pnpm test:coverage`, `pnpm build`, `pnpm check:size`, and `pnpm e2e` after the one-time `pnpm e2e:install --with-deps`. `pnpm check` runs `typecheck`, `lint`, `check:i18n`, `format:check`, `test`, and `check:gen`.

`REUSE.toml` handles license headers; preserve its third-party annotations when adding or moving files. From the repository root, run `reuse lint` if you have REUSE, and run `pnpm test:coverage` to print coverage totals and write `coverage/lcov.info`.

## Organize changes

The source tree has one folder per concern:

| Folder         | Holds                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api`      | The transport client, contract types, error model, selectors and the demo backend (`mock/`)                                                                          |
| `src/store`    | Resource watching and action hooks; owns cached reads. Feature controllers may call `getApi()` directly for actions                                                  |
| `src/dae`      | The dae text vocabulary, scanner and group-entry helpers shared by the editor, the features and the demo backend                                                     |
| `src/features` | One folder per page: a controller hook (`use*.ts`) owns store hooks, URL state and actions; `view.ts` holds pure projections with unit tests; components only render |
| `src/shell`    | Routing, navigation, appearance, shortcuts and search                                                                                                                |
| `src/ui`       | The presentational kit and its stylesheets                                                                                                                           |
| `src/i18n`     | Message loading and formatting                                                                                                                                       |

Create one folder for each feature under `src/features`. Keep a feature's pages, hooks, strings, and tests in that folder. Put visible strings in `messages.ts`. Read backend data through `src/store` hooks from a feature's controller; components receive prepared values and callbacks and never fetch, guard or format on their own. A projection too large for one `view.ts` may move into pure sibling modules beside it, such as `dns/cache.ts`, `dns/stats.ts` and `activity/ranking.ts`; they follow the same rules as `view.ts`: no React, no store, and a unit test beside each.

Imports point down the layers:

| Code in                          | May not import                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/ui`                         | `src/features`, `src/store`, `src/shell`; the kit takes data as props                                        |
| `src/store`                      | `src/features`, `src/shell`, `src/ui`                                                                        |
| `src/api`, `src/dae`, `src/i18n` | `src/features`, `src/shell`, `src/store`, `src/ui`                                                           |
| a feature                        | another feature; share through `src/features/shared` or a lower layer                                        |
| `src/shell`                      | `src/features`, except `src/features/shared`, each feature's `nav.ts`, and the page loaders in `registry.ts` |

Some lists have one home, and everything else reads them:

- Pages: `routePaths` in `src/shell/routes.ts` and the definition keyed by that path in `src/shell/registry.ts`.
- Palettes: `src/shell/palettes.ts`. The build injects the ids and the default into the first-paint script `tools/stamp.js`.
- Browser storage keys: `src/api/storage.ts`. Never change a key's string: browsers already hold it.

## Translations

doona ships three languages: Traditional Chinese (`zh-TW`), Simplified Chinese (`zh-CN`) and English (`en`). Each feature keeps its strings in its own `messages.ts`, with the three tables side by side, so a translator sees every language of a key together. `src/i18n/locales/*.ts` is generated from those files; do not edit it.

To correct a translation:

1. Find the key. Search for the text in the `messages.ts` files, then search for the key under `src/` to see where it appears.
2. Change the value in `messages.ts` and run `pnpm gen:locales`.
3. Run `pnpm check`. `check:i18n` fails when a language lacks a key, when a key's placeholders such as `{n}` differ between languages, when a key is unused, and when a component writes interface text itself instead of taking it from a catalogue.
4. In the pull request, say what was wrong. Add a screenshot when the new text is longer, since labels have to fit a phone.

Write formal Traditional Chinese in `zh-TW` and idiomatic Simplified Chinese in `zh-CN`, each with its own region's computing terms (組態／配置, 連線／连接, 記憶體／内存). Write plain English in sentence case. Use the term the rest of the catalogue already uses for the same concept. Keep placeholders as written. A count in English uses `{one, other}` forms; Chinese needs only one form.

Every language must be complete: a key missing from one table fails `pnpm typecheck`, and there is no fallback to another language. To propose a new language, open an issue first, naming the language and who will review its strings.

## UI components

React Spectrum S2 is the design reference: behaviour, spacing, states and wording follow it. Components are built on `react-aria-components` with doona's own CSS in `src/ui`; a new component starts from the S2 design and only then from React Aria.

doona does not depend on `@react-spectrum/s2`. Version 1.7.1 unpacks to about 54 MB against about 6.6 MB for `react-aria-components`, and its styles come from `@parcel/macros`, a build-time macro that needs a bundler plugin. doona is served by routers and keeps gzip budgets of 275 KB for the startup shell and 680 KB for all JavaScript (`sizeBudget` in `package.json`, enforced by `pnpm check:size`).

Each role has one kit component in `src/ui`. Variants are typed props, never class strings, and styling uses tokens only. Features compose kit components and do not use React Aria components or kit class names directly; a composition with a single consumer may stay in its feature until a second one needs it.

| Role (S2 name)                  | Kit component                          |
| ------------------------------- | -------------------------------------- |
| Button, LinkButton              | `Button`, `Link`                       |
| ActionGroup                     | `ActionGroup`                          |
| Menu, ActionMenu                | `ChoiceMenu`                           |
| Picker                          | `LabeledSelect`, `InlineSelect`        |
| SegmentedControl                | `Segmented`                            |
| Card                            | `Card`                                 |
| TableView                       | `DataTable`                            |
| InlineAlert, IllustratedMessage | `InlineAlert`, `Empty`, `ErrorMessage` |
| TagGroup                        | `Tags`, `Tag`                          |

What this leaves out, on purpose:

- No S2 package, style macro or S2 theme tokens. Colours come from the official palettes in `src/ui/styles/palettes.css`.
- No S2 icon package. The icons doona uses are copied one at a time from Adobe Spectrum under Apache-2.0 (see NOTICE).
- No automatic S2 updates. When S2 changes a component's behaviour or look, doona follows by hand.
- No second component library beside React Aria.

Revisit this if S2 stops requiring the macro or the size budgets stop applying.

## Commit and pull request flow

Use commit subjects in this form:

```text
type(scope): short subject
```

Write the subject and body in English. Use an imperative subject and explain the change and its reason in the body. Use these types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, and `style`.

Branch from `main`. Keep pull requests small and limited to one theme. Keep CI green.

Use the GitHub issue and pull request templates, including their Chinese variants. Name the human responsible and report only verified results.

Write the pull request body in English with one short paragraph under each of `## Problem`, `## How I fixed it` and `## Verified`, in that order: what is wrong, what changed, and what was checked, not the reasoning that led there. Verified lists the commands you ran and what they reported; link long evidence instead of pasting it.

Use [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). Start with `0.1.0`
and number pre-releases as `-alpha.N`, `-beta.N` or `-rc.N`. Tag each tested
release `vX.Y.Z[-pre.N]`. Mark GitHub releases for pre-release versions as
pre-releases. Update the declared version and changelog before tagging.

For tag `v0.1.0-beta.6`, release assets keep the upstream version without `v`. See the
[package version table](install/README.md#version-spellings) for every archive, binary package and source recipe.

## Update the contract

Start with `contract/api-standardize/SOURCE.md`. Update the vendored contract, run `pnpm gen:api`, then run `tools/check-gen.sh`. Do not edit generated API types directly.
