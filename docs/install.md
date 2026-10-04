# Installation and packages

English / [简体中文](install.zh-CN.md) / [繁體中文](install.zh-TW.md)

## Status

doona targets the native API implemented by honk's `feat/native-api` branch; that API is not released yet. The contract it is built against is pinned in [SOURCE.md](../contract/api-standardize/SOURCE.md). Backends that omit newer resource keys are accepted: doona fills those keys as unavailable. With no backend configured, a built-in mock supplies demo data; all screenshots in the READMEs and these docs pages show the mock.

## Install

doona needs honk's native API, which only the `debug` release of [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) provides so far. Download the program archive and `SHA256SUMS` from the same tag on the [releases page](https://github.com/Zakkaus/doona/releases).

Extract `doona-<version>.tar.gz` into the directory that honk's `native_api` block names in `ui`, and honk serves doona at `/ui/`. Extract optional archives into the same directory.

The [documentation](https://zakkaus.github.io/doona-docs/en/) covers the requirements, installing honk and doona, an example configuration, the first sign-in, checking each feature and troubleshooting.

## Release files

A release has 38 files. Most people need two: the program file for their system and `SHA256SUMS`. The names below are for v0.1.0-beta.14; other versions follow the same [spellings](../install/README.md#version-spellings).

### Program

Choose one, for a manual install or for your system's package manager.

| File                                  | What it is                              | Choose for                              |
| ------------------------------------- | --------------------------------------- | --------------------------------------- |
| `doona-0.1.0-beta.14.tar.gz`          | The built UI and licences, no installer | Manual installation with any web server |
| `doona-web_0.1.0-beta.14-1_all.deb`   | Debian package                          | Debian or Ubuntu                        |
| `doona-0.1.0-beta.14-1.noarch.rpm`    | RPM package                             | Fedora or openSUSE                      |
| `doona-0.1.0beta14-1-any.pkg.tar.zst` | pacman package                          | Arch Linux                              |
| `doona_0.1.0-beta.14-1_all.ipk`       | opkg package                            | OpenWrt 24.10 and earlier               |
| `doona-0.1.0_beta14-r1.apk`           | apk-tools 3 package                     | OpenWrt 25.12                           |
| `doona-0.1.0-beta.14-r0.alpine.apk`   | Alpine package                          | Alpine Linux                            |

Debian and Ubuntu ship an unrelated `doona` package, so their deb is named `doona-web` and installs into `/usr/share/doona-web`; set honk's `ui` to that path. The other package formats keep the name `doona` and install into `/usr/share/doona`. Alpine and OpenWrt apk files are not interchangeable.

### Optional add-ons

Each add-on comes in the same formats as the program, with `fonts` or `precompressed` in its name: `doona-fonts-0.1.0-beta.14.tar.gz`, `doona-web-fonts_0.1.0-beta.14-1_all.deb`, `doona-fonts_0.1.0-beta.14-1_all.ipk` and so on. Install the add-on in the same format and version as the program.

| Name part       | What it adds                                                                              | When to install                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `fonts`         | Noto Sans TC and SC, about 8 MB                                                           | You want the bundled Chinese fonts instead of the system's. See [Fonts](fonts.md) |
| `precompressed` | `.br` and `.gz` copies of the text assets, about 1.6 MB                                   | Servers and desktops; optional on a router                                        |
| `doc` (Alpine)  | `doona-doc-0.1.0-beta.14-r0.alpine.apk`: the NOTICE file, split off as Alpine packages do | Rarely needed                                                                     |

Precompressed means compressed in advance. When a browser accepts compression, honk or a web server sends the `.br` or `.gz` copy instead of compressing the file for each request, so it spends no CPU on compression and pages load faster on a slow link. The copies are made with `brotli -q 11` and `gzip -9 -n` for text assets of at least 1 KiB; only copies smaller than the original are kept. For a manual install, extract the archive into the directory holding doona's files.

### apk signing keys

| File                   | What it is                                   | Used by                                   |
| ---------------------- | -------------------------------------------- | ----------------------------------------- |
| `doona-alpine.rsa.pub` | Public key that verifies the Alpine packages | Alpine: copy into `/etc/apk/keys/`        |
| `doona-openwrt.pem`    | Public key that verifies the OpenWrt index   | OpenWrt 25.12: copy into `/etc/apk/keys/` |
| `doona-openwrt.adb`    | Signed index of the OpenWrt apk packages     | OpenWrt 25.12: `apk add -X` reads it      |

Each release signs with a new key. See [Installing the apk packages](../install/README.md#installing-the-apk-packages).

### honk

From v0.1.0-beta.8 on, until honk publishes a release with the native API, each release also attaches honk builds, so no one needs to compile honk. They are unmodified copies of a honk debug pre-release built from honk's native API branch.

| File                                      | What it is                                             |
| ----------------------------------------- | ------------------------------------------------------ |
| `honk-core-debug-<target>[-stock].tar.gz` | One honk build per target, eight in all                |
| `HONK-SOURCE.txt`                         | The honk release and commit, with each build's SHA-256 |
| `honk-source-<commit>.tar.gz`             | honk's source at that commit                           |

| Name part             | Choose for                                            |
| --------------------- | ----------------------------------------------------- |
| `x86_64` or `aarch64` | The gateway's CPU, as `uname -m` prints it            |
| `unknown-linux-musl`  | A static binary for gateways; choose this when unsure |
| `unknown-linux-gnu`   | A glibc-based distribution                            |
| No suffix             | mimalloc, the default allocator                       |
| `-stock`              | The system allocator instead of mimalloc              |

[Install honk](https://zakkaus.github.io/doona-docs/en/install.html#install) explains which build fits a gateway and how to verify and install it.

### Checksums and source

| File                                    | What it is                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SHA256SUMS`                            | SHA-256 of every release file except itself; check downloads with `sha256sum -c --ignore-missing SHA256SUMS` |
| Source code (zip), Source code (tar.gz) | doona's source at the release tag, added by GitHub                                                           |

## For packagers

See [install/README.md](../install/README.md) for package versions, recipes, signing, local builds and installation commands.
