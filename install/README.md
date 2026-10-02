# Packaging recipes

Each file follows a package that already exists in the target repository; keep them in step with that model
rather than with each other.

| File                                       | Modelled on                                                                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfpm/doona.yaml`, `nfpm/doona-fonts.yaml` | the nfpm configs in [daeuniverse/repo-for-linux](https://github.com/daeuniverse/repo-for-linux/tree/main/nfpm) (`dae.yaml`, `v2ray-rules-dat.yaml`)                                                                  |
| `openwrt/doona/Makefile`                   | [openwrt/packages](https://github.com/openwrt/packages) `net/v2ray-geodata` (data-only, `PKGARCH:=all`, `Download/` blocks) and `net/v2raya` (unpacking a release tarball in `Build/Prepare`)                        |
| `alpine/APKBUILD`                          | [aports](https://gitlab.alpinelinux.org/alpine/aports) `community/font-noto-cjk` (noarch, subpackage)                                                                                                                |
| `gentoo/net-proxy/doona`                   | the [gentoo-zh overlay](https://github.com/gentoo-zh/overlay)'s dashboards (`net-proxy/zashboard`, `net-proxy/daed` with its upstream `web.zip`): release archives in `SRC_URI`, `doins -r`, fonts behind a USE flag |
| `nix/package.nix`                          | [nixpkgs](https://github.com/NixOS/nixpkgs) prebuilt web packages using `fetchurl` and `stdenvNoCC`                                                                                                                  |
| the AUR `doona-bin` (separate repository)  | v2rayA's `install/aur/v2raya-bin/PKGBUILD`                                                                                                                                                                           |

The OpenWrt, Alpine, Gentoo and Nix recipes are unpublished templates, not ready for distribution.
All four consume the prebuilt program archive, with the font archive where enabled.
Before submission, replace the marked OpenWrt and Nix hashes using `SHA256SUMS`, generate Alpine checksums with
`abuild checksum`, and generate the Gentoo `Manifest` with `ebuild … manifest`.
The release workflow generates and attaches `SHA256SUMS`; it does not replace recipe placeholders.
After publishing the assets, fill both OpenWrt hashes, run `abuild checksum`, generate the Gentoo `Manifest`
with `ebuild doona-0.1.0_beta13.ebuild manifest`, and replace both Nix `lib.fakeHash` values.
The Gentoo template keeps the existing `metadata.xml`; no version-specific metadata change is needed.

## Version spellings

The recipes use tag `v0.1.0-beta.13`. Release assets keep the upstream version without the tag's `v`;
package metadata follows each package manager's ordering rules. The same names and versions apply to `doona-fonts`, which the deb names `doona-web-fonts`.

| Format           | `doona` asset                                 | Version in package or recipe                        |
| ---------------- | --------------------------------------------- | --------------------------------------------------- |
| Program archive  | `doona-0.1.0-beta.13.tar.gz`                  | n/a                                                 |
| Fonts archive    | `doona-fonts-0.1.0-beta.13.tar.gz`            | n/a                                                 |
| Debian           | `doona-web_0.1.0-beta.13-1_all.deb`           | `0.1.0~beta.13-1`                                   |
| RPM              | `doona-0.1.0-beta.13-1.noarch.rpm`            | Version `0.1.0~beta.13`, Release `1`                |
| OpenWrt ipk      | `doona_0.1.0-beta.13-1_all.ipk`               | `0.1.0~beta.13-1`                                   |
| Arch             | `doona-0.1.0beta13-1-any.pkg.tar.zst`         | pkgver `0.1.0beta13`, pkgrel `1`, default epoch `0` |
| Alpine APKBUILD  | Download the program and fonts archives above | pkgver `0.1.0_beta13`, pkgrel `0`                   |
| Gentoo ebuild    | Download the program and fonts archives above | PV `0.1.0_beta13`                                   |
| OpenWrt Makefile | Download the program and fonts archives above | PKG_VERSION `0.1.0_beta13`, PKG_RELEASE `1`         |
| Nix recipe       | Download the program and fonts archives above | `0.1.0-beta.13`                                     |

The beta binary recipes were last exercised against a local `pnpm package` build: `abuild -r` in an Alpine 3.22
container, the OpenWrt SDK for 24.10 (ipk) and 25.12 (apk), and nfpm 2.47 for deb, rpm, ipk and Arch, each
installed and removed in its target root filesystem (Debian 13, Fedora 42, openSUSE Tumbleweed, Arch, OpenWrt 24.10
and 25.12, Alpine 3.22), and the ebuild through `pkgcheck scan` and `emerge` in both USE states on an amd64 Gentoo host.
The ebuild keywords the architectures listed in `KEYWORDS`; only amd64 was exercised in that local check.
Replace placeholder hashes and generate the required checksums or manifests before submission.

The overlay's `AGENTS.md` governs the ebuild's submission: commit with `pkgdev commit --scan false --signoff`
under the subject `net-proxy/doona: new package, add 0.1.0_beta13`, keep the `Manifest` in the same commit, and add
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
The program archive has `index.html`, assets, `LICENSE`, `LICENSES/`, `NOTICE` and `THIRD-PARTY-NOTICES.txt` at its
root; `THIRD-PARTY-NOTICES.txt` carries the licence texts of the npm packages compiled into the build. The separate font
archive has a `fonts/` directory containing the Vite-bundled [Fontsource subsets](../docs/fonts.md), `OFL.txt` and `README`. OpenWrt and Alpine unpack these into
separate staging directories and install them under `/usr/share/doona` and `/usr/share/doona/fonts`.
Nix unpacks the release archives under `$out/share/doona`. nfpm stages the same archives for its packages.
The default local invocation uses the version in `package.json`.

For local distribution, run `pnpm build && pnpm package` from the repository root and deploy the program archive
from `release/`, plus the font archive if needed. Do not distribute raw `dist/`: it lacks the program's licence
and notice files.

For staged installs from a local build, `make install` installs the program and notices, and `make install-fonts`
installs the optional Noto subsets and their licence. Both targets accept `DESTDIR` and `PREFIX`.

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
