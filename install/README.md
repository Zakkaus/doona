# Packaging recipes

Each file follows a package that already exists in the target repository; keep them in step with that model
rather than with each other.

| File                                       | Modelled on                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfpm/doona.yaml`, `nfpm/doona-fonts.yaml` | the nfpm configs in [daeuniverse/repo-for-linux](https://github.com/daeuniverse/repo-for-linux/tree/main/nfpm) (`dae.yaml`, `v2ray-rules-dat.yaml`)                                                                             |
| `openwrt/doona/Makefile`                   | [openwrt/packages](https://github.com/openwrt/packages) `net/v2ray-geodata` (data-only, `PKGARCH:=all`, `Download/` blocks) and `net/v2raya` (unpacking a release tarball in `Build/Prepare`)                                   |
| `alpine/APKBUILD`                          | [aports](https://gitlab.alpinelinux.org/alpine/aports) `community/font-noto-cjk` (noarch, subpackage)                                                                                                                           |
| `gentoo/net-proxy/doona`                   | the [gentoo-zh overlay](https://github.com/gentoo-zh/overlay)'s dashboards (`net-proxy/zashboard`, `net-proxy/daed` with its upstream `web.zip`): release archives in `SRC_URI`, `doins -r`, fonts behind a USE flag            |
| `nix/package.nix`                          | [nixpkgs](https://github.com/NixOS/nixpkgs) `pkgs/by-name/da/daed/package.nix` (the `web` derivation: `fetchPnpmDeps`, `pnpmConfigHook`, `pnpm build`) and the pnpm section of `doc/languages-frameworks/javascript.section.md` |
| the AUR `doona-bin` (separate repository)  | v2rayA's `install/aur/v2raya-bin/PKGBUILD`                                                                                                                                                                                      |

The OpenWrt, Alpine, Gentoo and Nix recipes are unpublished templates. Replace every marked hash before submission;
none is ready for distribution. OpenWrt uses `SHA256SUMS`, Alpine uses `abuild checksum`, Gentoo
`ebuild … manifest`, and Nix needs the source hash from `nix-prefetch-github` and the dependency hash from the
first build's mismatch message.

Version spellings differ by packager and are all derived from the same tag: nfpm takes `0.1.0~beta.1` so deb,
rpm and its ipk sort before the release; the OpenWrt feed Makefile, the APKBUILD and the ebuild use `0.1.0_beta1`, the
only pre-release form apk and Portage accept (OpenWrt 25 and later build apk packages from the same Makefile that builds
ipk on 24.10).

The binary recipes were last exercised against a local `pnpm package` build: `abuild -r` in an Alpine 3.22
container, the OpenWrt SDK for 24.10 (ipk) and 25.12 (apk), and nfpm 2.47 for deb, rpm, ipk and Arch, each
installed and removed in its target root filesystem (Debian 13, Fedora 42, openSUSE Tumbleweed, Arch, OpenWrt 24.10
and 25.12, Alpine 3.22), and the ebuild through `pkgcheck scan` and `emerge` in both USE states on an amd64 Gentoo host (`~arm64` is
keyworded untested; the overlay's CI installs it). Only the hashes changed between that run and a tag.

The overlay's `AGENTS.md` governs the ebuild's submission: commit with `pkgdev commit --scan false --signoff`
under the subject `net-proxy/doona: new package, add 0.1.0_beta1`, keep the `Manifest` in the same commit, and add
a `.github/workflows/overlay.toml` entry in `category/package` order. The tag shape maps onto the ebuild version
the way `dev-util/deepseek-harness` maps its pre-release tags:

```toml
["net-proxy/doona"]
source = "github"
github = "Zakkaus/doona"
use_latest_release = true
prefix = "v"
from_pattern = '\.(alpha|beta|rc)\.(\d+)$'
to_pattern = '_\1\2'
github_account = "Zakkaus"
```

The nixpkgs expression names a `zakkaus` maintainer; nixpkgs wants that entry in `maintainers/maintainer-list.nix`
as its own commit before the package.

The release workflow runs `tools/package.sh --git-version`: tag `v0.1.0-beta.1` produces
`doona-v0.1.0-beta.1.tar.gz` and `doona-fonts-v0.1.0-beta.1.tar.gz`, matching the binary recipes.
The program archive has `index.html`, assets and notices at its root. The separate font archive has a
`fonts/` directory containing the subsets, `OFL.txt` and `README`. OpenWrt and Alpine unpack these into
separate staging directories and install them under `/usr/share/doona` and `/usr/share/doona/fonts`.
Nix builds the source tag instead, using `make install` and optional `make install-fonts` under `$out/share/doona`.
The default local invocation uses `package.json` instead, so its archive names omit the leading `v`.
