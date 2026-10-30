# Installation and packages

English / [简体中文](install.zh-CN.md) / [繁體中文](install.zh-TW.md)

doona is distributed as static web files. The current release is v0.1.0-rc.4; doona lite is a preview in testing.

For installation, use the documentation site's [system requirements](https://doona.daeuniverse.org/en/requirements.html), [installation guide](https://doona.daeuniverse.org/en/install.html) and [doona lite guide](https://doona.daeuniverse.org/en/lite.html). Those pages cover backend setup, distribution-specific instructions and first sign-in. This page describes the files built by this repository. For current honk download names and attachment status, see [Matching honk builds](#matching-honk-builds).

## Release archives

[tools/package.sh](../tools/package.sh) creates these archives under `release/`. `<version>` is the version without the tag's leading `v`.

| Archive                                | Contents                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `doona-<version>.tar.gz`               | Standard edition from `dist/`, excluding `fonts/` and `.vite/`, plus licence and notice files     |
| `doona-lite-<version>.tar.gz`          | Lite edition from `apps/lite/dist/`, plus licence and notice files; uses system fonts             |
| `doona-fonts-<version>.tar.gz`         | Optional `fonts/` directory with Noto Sans TC and SC subsets, `OFL.txt` and `README`              |
| `doona-precompressed-<version>.tar.gz` | Optional `.br` and `.gz` copies of the standard edition's text assets, at matching relative paths |

Both program archives have `index.html` at the archive root. Each includes `LICENSE`, `LICENSES/`, `NOTICE`, `README.md`, `README.en.md` and `THIRD-PARTY-NOTICES.txt`. [tools/notices.mjs](../tools/notices.mjs) collects licence texts for bundled dependencies. The program archives do not include `CHANGELOG.md`.

The precompressed archive contains copies of selected text assets at least 1 KiB in size. Packaging uses `brotli -q 11` and `gzip -9 -n` and keeps a copy only when it is smaller than the original. Fonts are packaged separately; see [Fonts](fonts.md).

## Matching honk builds

The standalone UI is published first. Matching honk builds and corresponding sources are attached afterward; check the [release notes and assets](https://github.com/Zakkaus/doona/releases/tag/v0.1.0-rc.4) for attachment status.

The full builds are named `honk-core-debug-<target>[-stock]-full.tar.gz`. Older releases omit `-full`, so use the current asset names when following older installation examples. The eight variants cover x86_64 and aarch64, musl and GNU, with mimalloc or the system allocator (`-stock`). Choose musl when unsure. When attached, these builds embed the matching doona version, served with `ui: embedded`.

[tools/fetch-honk.mjs](../tools/fetch-honk.mjs) verifies the embedded version, revision and program SHA-256 against the published doona release. `HONK-SOURCE.txt` records the honk release and commit, embedded doona version and revision, program SHA-256, and corresponding sources. The source archives are `honk-source-<commit>.tar.gz` and `doona-source-<version>.tar.gz`.

## Package layout

| Package or recipe                                        | UI directory                                 |
| -------------------------------------------------------- | -------------------------------------------- |
| Debian `doona-web`                                       | `/usr/share/doona-web`                       |
| RPM, Arch and OpenWrt `doona`; Alpine and Gentoo recipes | `/usr/share/doona`                           |
| Nix recipe                                               | `$out/share/doona`                           |
| Manual archive                                           | Directory chosen when extracting the archive |

The Debian add-ons are named `doona-web-fonts` and `doona-web-precompressed`. Other distribution packages use `doona-fonts` and `doona-precompressed`. The font files go under the UI directory's `fonts/`; precompressed files sit beside the original assets. Alpine and OpenWrt use separate apk builds and signing procedures.

Package filenames and metadata use different prerelease spellings. See [version spellings](../install/README.md#version-spellings) and [apk signing and installation](../install/README.md#installing-the-apk-packages) in the packaging reference.

Alpine also provides `doona-doc-<version>-r0.alpine.apk`, which contains the `NOTICE` file.

## Build and packaging sources

| Source                                                                                                                          | Responsibility                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [tools/package.sh](../tools/package.sh)                                                                                         | Stage both editions, split optional archives and write their `SHA256SUMS`      |
| [.github/workflows/release.yml](../.github/workflows/release.yml)                                                               | Build distribution packages, collect release files and regenerate `SHA256SUMS` |
| [install/nfpm/](../install/nfpm/)                                                                                               | Debian, RPM, Arch and ipk package definitions                                  |
| [install/alpine/APKBUILD](../install/alpine/APKBUILD)                                                                           | Alpine package and subpackages                                                 |
| [install/openwrt/doona/Makefile](../install/openwrt/doona/Makefile)                                                             | OpenWrt package and add-ons                                                    |
| [install/gentoo/net-proxy/doona/](../install/gentoo/net-proxy/doona/) and [install/nix/package.nix](../install/nix/package.nix) | Gentoo and Nix recipes                                                         |

Packaging requires built output for both editions, even when only the standard archive is needed. See the [development guide](https://doona.daeuniverse.org/en/development.html) for dependency installation and build commands, and [install/README.md](../install/README.md) for package maintenance.
