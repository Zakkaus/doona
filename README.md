# doona

doona provides a React 19 and TypeScript web UI for daeuniverse/honk. The repository generates API types from the vendored OpenAPI contract.

## Status

doona is pre-release. It runs against the mock backend by default while honk has not shipped `/api/v1`. It targets the `daeuniverse/api-standardize` `ui-findings` contract at commit `8bd9871`.

## Build and serve

Use Node 22 or later and pnpm 11.15.1. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
```

The build writes the static site to `dist/`. Serve `dist/` with any static server.

## Use a backend

Until the settings page lands, configure the backend in browser local storage. Set `doona-api` to the server root or reverse-proxy prefix. Set `doona-api-token` to the bearer token. Leave `doona-api` unset to use the mock backend.

## Check the repository

```sh
pnpm check
```

## Repository layout

| Path           | Purpose                                       |
| -------------- | --------------------------------------------- |
| `src/features` | Product features                              |
| `src/shell`    | Application shell and routing                 |
| `src/ui`       | Shared UI components and icons                |
| `src/api`      | API client, mock backend, and generated types |
| `src/i18n`     | Translations and locale helpers               |
| `contract`     | Vendored OpenAPI contract                     |
| `tools`        | Development and verification tools            |
| `reference`    | Read-only archived UI references              |

## License and credits

This repository licenses doona under [GPL-3.0-only](LICENSE). It includes fonts under the [Open Font License](public/fonts/OFL.txt). [NOTICE](NOTICE) credits Adobe Spectrum icon artwork under Apache-2.0 and flag artwork under MIT.
