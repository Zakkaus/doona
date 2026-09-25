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

The OpenWrt, Alpine, Gentoo and Nix recipes are unpublished templates. Replace every marked hash before submission;
none is ready for distribution. All four consume the prebuilt program archive, with the font archive where enabled.
OpenWrt uses `SHA256SUMS`, Alpine uses `abuild checksum`, Gentoo uses `ebuild … manifest`, and Nix uses the
archive hashes in `SHA256SUMS`.

## Version spellings

The recipes use tag `v0.1.0-beta.5`. Release assets keep the upstream version without the tag's `v`;
package metadata follows each package manager's ordering rules. The same names and versions apply to `doona-fonts`.

| Format           | `doona` asset                                 | Version in package or recipe                       |
| ---------------- | --------------------------------------------- | -------------------------------------------------- |
| Program archive  | `doona-0.1.0-beta.5.tar.gz`                   | n/a                                                |
| Fonts archive    | `doona-fonts-0.1.0-beta.5.tar.gz`             | n/a                                                |
| Debian           | `doona_0.1.0-beta.5-1_all.deb`                | `0.1.0~beta.5-1`                                   |
| RPM              | `doona-0.1.0-beta.5-1.noarch.rpm`             | Version `0.1.0~beta.5`, Release `1`                |
| OpenWrt ipk      | `doona_0.1.0-beta.5-1_all.ipk`                | `0.1.0~beta.5-1`                                   |
| Arch             | `doona-0.1.0beta5-1-any.pkg.tar.zst`          | pkgver `0.1.0beta5`, pkgrel `1`, default epoch `0` |
| Alpine APKBUILD  | Download the program and fonts archives above | pkgver `0.1.0_beta5`, pkgrel `0`                   |
| Gentoo ebuild    | Download the program and fonts archives above | PV `0.1.0_beta5`                                   |
| OpenWrt Makefile | Download the program and fonts archives above | PKG_VERSION `0.1.0_beta5`, PKG_RELEASE `1`         |
| Nix recipe       | Download the program and fonts archives above | `0.1.0-beta.5`                                     |

The beta binary recipes were last exercised against a local `pnpm package` build: `abuild -r` in an Alpine 3.22
container, the OpenWrt SDK for 24.10 (ipk) and 25.12 (apk), and nfpm 2.47 for deb, rpm, ipk and Arch, each
installed and removed in its target root filesystem (Debian 13, Fedora 42, openSUSE Tumbleweed, Arch, OpenWrt 24.10
and 25.12, Alpine 3.22), and the ebuild through `pkgcheck scan` and `emerge` in both USE states on an amd64 Gentoo host (`~arm64` is
keyworded untested; the overlay's CI installs it). The recipes need new release hashes before submission.

The overlay's `AGENTS.md` governs the ebuild's submission: commit with `pkgdev commit --scan false --signoff`
under the subject `net-proxy/doona: new package, add 0.1.0_beta5`, keep the `Manifest` in the same commit, and add
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
The program archive has `index.html`, assets and notices at its root. The separate font archive has a
`fonts/` directory containing the subsets, `OFL.txt` and `README`. OpenWrt and Alpine unpack these into
separate staging directories and install them under `/usr/share/doona` and `/usr/share/doona/fonts`.
Nix unpacks the release archives under `$out/share/doona`. nfpm stages the same archives for its packages.
The default local invocation uses the version in `package.json`.
