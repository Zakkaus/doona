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

Create one folder for each feature under `src/features`. Keep a feature's pages, hooks, strings, and tests in that folder. Put visible strings in `messages.ts`. Read backend data through `src/store` hooks from a feature's controller; components receive prepared values and callbacks and never fetch, guard or format on their own.

Use formal Traditional Chinese in `zh-TW`, idiomatic Simplified Chinese in `zh-CN`, and plain English in English messages.

## UI components

React Spectrum S2 is the design reference: behaviour, spacing, states and wording follow it. Components are built on `react-aria-components` with doona's own CSS in `src/ui`; a new component starts from the S2 design and only then from React Aria.

doona does not depend on `@react-spectrum/s2`. Version 1.7.1 unpacks to about 54 MB against about 6.6 MB for `react-aria-components`, and its styles come from `@parcel/macros`, a build-time macro that needs a bundler plugin. doona is served by routers and keeps gzip budgets of 275 KB for the startup shell and 655 KB for all JavaScript.

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

Use the commit body to explain why. Use these types: `feat`, `fix`, `refactor`, `docs`, `ci`, `build`, `deps`, `style`, `test`, and `contract`.

Branch from `main`. Keep pull requests small and limited to one theme. Keep CI green.

Write the pull request body in English with one short paragraph under each of `## Problem`, `## How I fixed it` and `## Verified`, in that order: what is wrong, what changed, and what was checked, not the reasoning that led there. Verified lists the commands you ran and what they reported; link long evidence instead of pasting it.

## Update the contract

Start with `contract/api-standardize/SOURCE.md`. Update the vendored contract, run `pnpm gen:api`, then run `tools/check-gen.sh`. Do not edit generated API types directly.
