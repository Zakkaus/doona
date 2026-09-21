# Contributing

## Set up

Use Node 22 or later and pnpm 11.15.1. From the repository root:

```sh
pnpm install --frozen-lockfile
```

## Run the gate

Before opening a pull request, run the same gates as CI from the repository root: `pnpm check`, `pnpm test:coverage`, `pnpm build`, `pnpm check:size`, and `pnpm e2e` after the one-time `pnpm e2e:install --with-deps`. `pnpm check` runs `typecheck`, `lint`, `check:i18n`, `format:check`, `test`, and `check:gen`.

`REUSE.toml` handles license headers; preserve its third-party annotations when adding or moving files. From the repository root, run `reuse lint` if you have REUSE, and run `pnpm test:coverage` to print coverage totals and write `coverage/lcov.info`.

## Organize changes

Create one folder for each feature under `src/features`. Keep a feature's pages, hooks, strings, and tests in that folder. Put visible strings in `messages.ts`. Access backend data only through `src/api`.

Use formal Traditional Chinese in `zh-TW`, idiomatic Simplified Chinese in `zh-CN`, and plain English in English messages.

`reference/` is read-only history. Do not modify it for product changes.

## Commit and pull request flow

Use commit subjects in this form:

```text
type(scope): short subject
```

Use the commit body to explain why. Use these types: `feat`, `fix`, `refactor`, `docs`, `ci`, `build`, `deps`, `style`, `test`, and `contract`.

Branch from `main`. Keep pull requests small and limited to one theme. Keep CI green.

## Update the contract

Start with `contract/api-standardize/SOURCE.md`. Update the vendored contract, run `pnpm gen:api`, then run `tools/check-gen.sh`. Do not edit generated API types directly.
