# doona

doona provides a React 19 and TypeScript web UI for daeuniverse/honk. The repository generates API types from the vendored OpenAPI contract.

## Status

doona is a contract and demo preview. The mock backend is available while honk has not shipped `/api/v1`. The client targets the `daeuniverse/api-standardize` `ui-findings` contract at commit `8bd9871`. This preview does not yet claim compatibility with a released honk backend.

## Build and serve

Use Node 22 or later and pnpm 11.15.1. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
```

The build writes the static site to `dist/`. Serve `dist/` with any static server.

To package a finished build, use GNU tar, gzip and sha256sum. From the repository root:

```sh
pnpm package
```

This creates `release/doona-<version>.tar.gz`, `release/doona-fonts-<version>.tar.gz` and `release/SHA256SUMS`. Both archives extract directly into a web root. The version comes from `package.json`; `tools/package.sh --git-version` uses `git describe --tags --always` instead. Archive timestamps use `SOURCE_DATE_EPOCH`, or the HEAD commit time when unset. When packaging without Git metadata, set `SOURCE_DATE_EPOCH` explicitly.

Tags matching `v*` run the release checks and attach both archives and their checksums to a draft GitHub release. The maintainer publishes the draft.

## Deploy

### Embedded in honk

Serve the program files from honk's `/ui/` directory and open `/ui/`. Hash links such as `/ui/#/flows?id=flow-2` need no server-side route rewriting.

### Static server

Extract `doona-<version>.tar.gz` into any static server's web root, or a subdirectory such as `/ui/`. Extract the optional `doona-fonts-<version>.tar.gz` into the same directory to add `fonts/`. It supplies Noto Sans TC for consistent CJK text; without it, the browser uses local fallback fonts. Missing font requests return 404 but do not prevent the page from working. Serve over HTTPS for PWA installation and offline caching; localhost also supports the service worker.

### Distribution packages

Nix, Debian, AUR, Gentoo and OpenWrt packages can install the same static program files, with `doona-fonts` as an optional package. Serving the build needs no Node runtime. An OpenWrt package can place the files in honk's UI directory.

For all three deployment paths, the first run opens Settings when there is no saved backend. Configure the API backend kind, server root or reverse-proxy prefix, and token there; do not append `/api/v1` to the URL. Settings also controls language and appearance.

## Browser support

The build targets these minimum browser versions:

| Browser | Minimum version |
| ------- | --------------- |
| Chrome  | 120             |
| Edge    | 120             |
| Firefox | 120             |
| Safari  | 17              |

The UI supports viewports from 360 px wide. The automated browser suite runs in Chromium, not Firefox or Safari.

## Check the repository

With the dependencies installed, run from the repository root:

```sh
pnpm check
pnpm build
pnpm check:size
pnpm e2e:install --with-deps
pnpm e2e
```

The browser suite checks the default deployment and the `/ui/` sub-path.

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
