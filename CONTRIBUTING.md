# Contributing

## Set up

Use Node 22 or later and pnpm 11.15.1. From the repository root:

```sh
pnpm install --frozen-lockfile
```

## Run the gate

Run `pnpm check` before opening a pull request. It runs:

- `pnpm typecheck` for TypeScript errors without emitting files.
- `pnpm lint` for ESLint rules.
- `pnpm format:check` for Prettier formatting.
- `pnpm test` for the Vitest suite.
- `pnpm check:gen` to verify generated API types match the vendored contract.

## Organize changes

Create one folder for each feature under `src/features`. Keep a feature's pages, hooks, strings, and tests in that folder. Put visible strings in `messages.ts`. Access backend data only through `src/api`.

Use formal Traditional Chinese in `zh-TW`, real Simplified Chinese in `zh-CN`, and plain English in English messages.

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
