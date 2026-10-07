# Packaging recipes

Each file follows a package that already exists in the target repository; keep them in step with that model
rather than with each other.

| File                                                                        | Modelled on                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfpm/doona.yaml`, `nfpm/doona-fonts.yaml`, `nfpm/doona-precompressed.yaml` | the nfpm configs in [daeuniverse/repo-for-linux](https://github.com/daeuniverse/repo-for-linux/tree/main/nfpm) (`dae.yaml`, `v2ray-rules-dat.yaml`)                                                                                                                                      |
| `openwrt/doona/Makefile`                                                    | [openwrt/packages](https://github.com/openwrt/packages) `net/v2ray-geodata` (data-only, `PKGARCH:=all`, `Download/` blocks), `net/v2raya` (unpacking a release tarball in `Build/Prepare`), `utils/vim` (`EXTRA_DEPENDS` on the same version) and `net/netdiscover` (`PKG_REAL_VERSION`) |
| `alpine/APKBUILD`                                                           | [aports](https://gitlab.alpinelinux.org/alpine/aports) `community/font-noto-cjk` (noarch, `_extra` split function) and its `CODINGSTYLE.md`                                                                                                                                              |
| `gentoo/net-proxy/doona`                                                    | the [gentoo-zh overlay](https://github.com/gentoo-zh/overlay)'s dashboards (`net-proxy/zashboard`, `net-proxy/daed` with its upstream `web.zip`): release archives in `SRC_URI`, `doins -r`, fonts behind a USE flag                                                                     |
| `nix/package.nix`                                                           | [nixpkgs](https://github.com/NixOS/nixpkgs) prebuilt web packages using `fetchurl` and `stdenvNoCC`                                                                                                                                                                                      |
| the AUR `doona-bin` (separate repository)                                   | v2rayA's `install/aur/v2raya-bin/PKGBUILD`                                                                                                                                                                                                                                               |

The OpenWrt, Alpine, Gentoo and Nix recipes are not yet submitted to their repositories.
All four consume the prebuilt program archive, with the font archive where enabled; the OpenWrt and Alpine recipes
also package the precompressed archive.
The OpenWrt and Alpine recipes hold the hashes of the last published archives. Neither repository has a
placeholder for an archive that is not published yet: maintainers run `make package/doona/check FIXUP=1` and
`abuild checksum` after a version bump. `tools/package-openwrt.sh` and `tools/package-alpine.sh` run those commands
against the archives they package, and the release workflow keeps the results as the `openwrt-recipe` and
`alpine-recipe` artifacts. After publishing a release, copy both from its run into the repository:

```sh
gh run download <run-id> -n openwrt-recipe -D install/openwrt/doona
gh run download <run-id> -n alpine-recipe -D install/alpine
```

Before submitting the Gentoo and Nix recipes, generate the Gentoo `Manifest` with
`ebuild doona-0.1.0_beta18.ebuild manifest` and replace both Nix `lib.fakeHash` values using `SHA256SUMS`.

The release workflow builds Alpine and OpenWrt 25.12 apk packages from the APKBUILD and the OpenWrt Makefile, using the
archives of the same run instead of the download URLs: `tools/package-alpine.sh` runs `abuild` in an Alpine 3.24
container and `tools/package-openwrt.sh` runs the OpenWrt 25.12 SDK. Either script can be run locally the same way;
the usage line at the top of each gives the `docker run` command.
The Gentoo template keeps the existing `metadata.xml`; no version-specific metadata change is needed.

## Version spellings

The recipes use tag `v0.1.0-beta.18`. Release assets keep the upstream version without the tag's `v`;
package metadata follows each package manager's ordering rules. The same names and versions apply to `doona-fonts` and
`doona-precompressed`, which the deb names `doona-web-fonts` and `doona-web-precompressed`.

| Format                                | `doona` asset                                 | Version in package or recipe                        |
| ------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Program archive                       | `doona-0.1.0-beta.18.tar.gz`                  | n/a                                                 |
| Fonts archive                         | `doona-fonts-0.1.0-beta.18.tar.gz`            | n/a                                                 |
| Precompressed archive                 | `doona-precompressed-0.1.0-beta.18.tar.gz`    | n/a                                                 |
| Debian                                | `doona-web_0.1.0-beta.18-1_all.deb`           | `0.1.0~beta.18-1`                                   |
| RPM                                   | `doona-0.1.0-beta.18-1.noarch.rpm`            | Version `0.1.0~beta.18`, Release `1`                |
| OpenWrt ipk (24.10 and earlier, opkg) | `doona_0.1.0-beta.18-1_all.ipk`               | `0.1.0~beta.18-1`                                   |
| OpenWrt apk (25.12, apk-tools 3)      | `doona-0.1.0_beta18-r1.apk`                   | `0.1.0_beta18-r1`                                   |
| Alpine apk                            | `doona-0.1.0-beta.18-r0.alpine.apk`           | `0.1.0_beta18-r0`                                   |
| Arch                                  | `doona-0.1.0beta18-1-any.pkg.tar.zst`         | pkgver `0.1.0beta18`, pkgrel `1`, default epoch `0` |
| Alpine APKBUILD                       | Download the three archives above             | pkgver `0.1.0_beta18`, pkgrel `0`                   |
| Gentoo ebuild                         | Download the program and fonts archives above | PV `0.1.0_beta18`                                   |
| OpenWrt Makefile                      | Download the three archives above             | PKG_VERSION `0.1.0_beta18`, PKG_RELEASE `1`         |
| Nix recipe                            | Download the program and fonts archives above | `0.1.0-beta.18`                                     |

The beta binary recipes were last exercised against a local `pnpm package` build: `abuild -r` in an Alpine 3.22
container, the OpenWrt SDK for 24.10 (ipk) and 25.12 (apk), and nfpm 2.47 for deb, rpm, ipk and Arch, each
installed and removed in its target root filesystem (Debian 13, Fedora 42, openSUSE Tumbleweed, Arch, OpenWrt 24.10
and 25.12, Alpine 3.22), and the ebuild through `pkgcheck scan` and `emerge` in both USE states on an amd64 Gentoo host.
The ebuild keywords the architectures listed in `KEYWORDS`; only amd64 was exercised in that local check.
Replace placeholder hashes and generate the required checksums or manifests before submission.

The overlay's `AGENTS.md` governs the ebuild's submission: commit with `pkgdev commit --scan false --signoff`
under the subject `net-proxy/doona: new package, add 0.1.0_beta18`, keep the `Manifest` in the same commit, and add
a `.github/workflows/overlay.toml` entry in `category/package` order. The semver beta tag maps onto the
ebuild's pre-release version with this overlay rule:

```toml
["net-proxy/doona"]
source = "github"
github = "Zakkaus/doona"
use_latest_release = true
prefix = "v"
from_pattern = '-(alpha|beta|rc)\.(\d+)$'
to_pattern = '_\1\2'
github_account = "Zakkaus"
```

The nixpkgs expression names a `zakkaus` maintainer; nixpkgs wants that entry in `maintainers/maintainer-list.nix`
as its own commit before the package.

The release workflow runs `tools/package.sh --git-version` to produce the program and fonts archives in the table.
The program archive has `index.html`, assets, `LICENSE`, `LICENSES/`, `NOTICE`, `README.md` and
`THIRD-PARTY-NOTICES.txt` at its root. `LICENSES/` holds the Apache-2.0, OFL-1.1 and GitHub logo texts; `NOTICE` links
the Creative Commons licences; `THIRD-PARTY-NOTICES.txt` carries the licence texts of the npm packages compiled into the
build, printing each distinct text once under the packages and copyright lines it covers. The archive has no
`CHANGELOG.md`: the deb, rpm, pacman and ipk packages take it from the repository, and the recipes that build from the
archive alone leave it out. The separate font
archive has a `fonts/` directory containing the Vite-bundled [Fontsource subsets](../docs/fonts.md), `OFL.txt` and `README`. OpenWrt and Alpine unpack these into
separate staging directories and install them under `/usr/share/doona` and `/usr/share/doona/fonts`.
Nix unpacks the release archives under `$out/share/doona`. nfpm stages the same archives for its packages.
The default local invocation uses the version in `package.json`.
The precompressed archive holds a `.br` (brotli -q 11) and a `.gz` (gzip -9 -n) copy of each text asset of at least
1 KiB, at the asset's own path, keeping only the copies that are smaller than the original.

For local distribution, run `pnpm build && pnpm package` from the repository root and deploy the program archive
from `release/`, plus the font archive if needed. Do not distribute raw `dist/`: it lacks the program's licence
and notice files.

For staged installs from a local build, `make install` installs the program and notices, and `make install-fonts`
installs the optional Noto subsets and their licence. Both targets accept `DESTDIR` and `PREFIX`.

## Precompressed assets

`doona-precompressed` installs the `.br` and `.gz` copies next to doona's files, in the same directory, and requires
the doona package of the same version. A server that finds those copies sends the compressed file to a browser that
accepts it, so the UI loads with fewer bytes over the network. Install it on servers and desktops; on a router it is
optional and costs about 1.6 MB of storage. The main package does not grow without it.

```sh
sudo apt install ./doona-web_<version>-1_all.deb ./doona-web-precompressed_<version>-1_all.deb   # Debian, Ubuntu
sudo dnf install ./doona-<version>-1.noarch.rpm ./doona-precompressed-<version>-1.noarch.rpm     # Fedora; zypper on openSUSE
sudo pacman -U doona-<pkgver>-1-any.pkg.tar.zst doona-precompressed-<pkgver>-1-any.pkg.tar.zst  # Arch
opkg install doona_<version>-1_all.ipk doona-precompressed_<version>-1_all.ipk                   # OpenWrt 24.10
```

For a manual install, extract `doona-precompressed-<version>.tar.gz` into the directory holding doona's files.

## Installing the apk packages

Each release builds its apk packages with a signing key generated for that run and attaches the public key.

Alpine signs every package. Install the key, then the packages:

```sh
wget -O /etc/apk/keys/doona-alpine.rsa.pub https://github.com/Zakkaus/doona/releases/download/<tag>/doona-alpine.rsa.pub
apk add ./doona-<version>-r0.alpine.apk ./doona-precompressed-<version>-r0.alpine.apk
```

Without the key, `apk add --allow-untrusted` installs the same files. apk finds the key by its file name, so keep
`doona-alpine.rsa.pub`; a later release replaces it.

OpenWrt 25.12 signs only the package index, `doona-openwrt.adb`, which names the packages by the file names they are
released under. Download the index and the packages into one directory, install the key, and install from the index:

```sh
cp doona-openwrt.pem /etc/apk/keys/
apk add -X /tmp/doona/doona-openwrt.adb doona doona-precompressed
```

Alternatively, install the package files directly with `apk add --allow-untrusted ./doona-<pkgver>-r1.apk`.
OpenWrt 24.10 and earlier use the ipk files above.

## Debian package name

Debian and Ubuntu ship an unrelated `doona` package, a network fuzzer at version 1.0 that installs into
`/usr/share/doona` and `/usr/share/doc/doona`. The deb is therefore named `doona-web`, with `doona-web-fonts` for the
fonts, and installs into `/usr/share/doona-web` and `/usr/share/doc/doona-web`; set honk's `ui` to
`/usr/share/doona-web` for it. The other formats keep the name `doona` and `/usr/share/doona`.
`install/nfpm/doona.yaml` and `doona-fonts.yaml` build both names: the release workflow sets `PACKAGE_SUFFIX=-web`
for the deb only.

Earlier releases shipped the deb as `doona` 0.1.x, and `apt upgrade` replaced it with the fuzzer, deleting the web
files. `doona-web` and `doona-web-fonts` replace and conflict with `doona` and `doona-fonts` below 1.0, so
installing them from a release removes the old fonts package. apt may upgrade a remaining 0.1.x `doona` to the fuzzer
instead of removing it; once `doona-web` is installed, `sudo apt remove doona` removes the fuzzer and leaves
`doona-web` in place.
