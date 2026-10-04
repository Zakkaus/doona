# Installation and packages

English / [简体中文](install.zh-CN.md) / [繁體中文](install.zh-TW.md)

## Status

doona targets the native API implemented by honk's `feat/native-api` branch; that API is not released yet. The contract it is built against is pinned in [SOURCE.md](../contract/api-standardize/SOURCE.md). Backends that omit newer resource keys are accepted: doona fills those keys as unavailable. With no backend configured, a built-in mock supplies demo data; all screenshots in the READMEs and these docs pages show the mock.

## Install

doona needs honk's native API, which only the `debug` release of [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) provides so far. Download the program archive and `SHA256SUMS` from the same tag on the [releases page](https://github.com/Zakkaus/doona/releases).

Extract `doona-<version>.tar.gz` into the directory that honk's `native_api` block names in `ui`, and honk serves doona at `/ui/`. Extract optional archives into the same directory.

The [documentation](https://zakkaus.github.io/doona-docs/en/) covers the requirements, installing honk and doona, an example configuration, the first sign-in, checking each feature and troubleshooting.

## Release assets and package choices

Choose the program archive for a manual install, or the package for your system. The names below are for v0.1.0-beta.14; other versions follow the same [spellings](../install/README.md#version-spellings).

| Format      | Program asset                         | Choose for                              |
| ----------- | ------------------------------------- | --------------------------------------- |
| tar.gz      | `doona-0.1.0-beta.14.tar.gz`          | Manual installation with any web server |
| deb         | `doona-web_0.1.0-beta.14-1_all.deb`   | Debian or Ubuntu                        |
| rpm         | `doona-0.1.0-beta.14-1.noarch.rpm`    | Fedora or openSUSE                      |
| Arch        | `doona-0.1.0beta14-1-any.pkg.tar.zst` | Arch Linux                              |
| ipk         | `doona_0.1.0-beta.14-1_all.ipk`       | OpenWrt 24.10 and earlier, using opkg   |
| OpenWrt apk | `doona-0.1.0_beta14-r1.apk`           | OpenWrt 25.12, using apk-tools 3        |
| Alpine apk  | `doona-0.1.0-beta.14-r0.alpine.apk`   | Alpine Linux                            |

Debian and Ubuntu ship an unrelated `doona` package, so their deb is named `doona-web` and installs into `/usr/share/doona-web`; set honk's `ui` to that path. The optional debs are `doona-web-fonts` and `doona-web-precompressed`. The other package formats keep the name `doona` and install into `/usr/share/doona`. Alpine and OpenWrt apk files are not interchangeable; see the [apk installation instructions](../install/README.md#installing-the-apk-packages) for their signing keys and commands.

### Optional fonts

`doona-fonts-<version>.tar.gz` contains Noto Sans TC and SC. Choose it, or the `doona-fonts` package, to use the bundled Chinese fonts; without it, the UI uses its font fallbacks. See [Fonts](fonts.md).

### Precompressed assets

Precompressed means compressed in advance. `doona-precompressed-<version>.tar.gz` and the `doona-precompressed` package add `.br` and `.gz` copies of the text assets next to the original files.

When a browser accepts compression, honk or a web server can send these already-compressed files instead of compressing them for each request. The server spends no CPU on compression and sends fewer bytes, so pages load faster on a slow link. The package is optional, and the main package does not change without it.

The copies take about 1.6 MB of extra disk.

Extract the precompressed archive into the directory holding doona's files. With packages, install `doona-precompressed` for the same version as the main package. The copies are made with `brotli -q 11` and `gzip -9 -n` for text assets of at least 1 KiB; only copies smaller than the original are kept.

## honk debug archives and checksums

From v0.1.0-beta.8 on, until honk publishes a release with the native API, each doona release also attaches prebuilt `honk-core-debug-<target>[-stock].tar.gz` archives, so no one needs to compile honk. The archives contain a debug build of honk's native API branch, which implements the final native API contract.

| Archive name part     | Choose for                                            |
| --------------------- | ----------------------------------------------------- |
| `x86_64` or `aarch64` | The gateway's CPU, as `uname -m` prints it            |
| `unknown-linux-musl`  | A static binary for gateways; choose this when unsure |
| `unknown-linux-gnu`   | A glibc-based distribution                            |
| No suffix             | mimalloc, the default allocator                       |
| `-stock`              | The system allocator instead of mimalloc              |

`HONK-SOURCE.txt` names the honk commit the archives were built from, and `honk-source-<commit>.tar.gz` holds that commit's source. `SHA256SUMS` covers every release asset except itself. [Install honk](https://zakkaus.github.io/doona-docs/en/install.html#install) explains which archive fits a gateway and how to verify and install it.

## For packagers

See [install/README.md](../install/README.md) for package versions, recipes, signing, local builds and installation commands.
