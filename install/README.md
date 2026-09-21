# Packaging recipes

Each file follows a package that already exists in the target repository; keep them in step with that model
rather than with each other.

| File                                       | Modelled on                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfpm/doona.yaml`, `nfpm/doona-fonts.yaml` | the nfpm configs in [daeuniverse/repo-for-linux](https://github.com/daeuniverse/repo-for-linux/tree/main/nfpm) (`dae.yaml`, `v2ray-rules-dat.yaml`)                                                                             |
| `openwrt/doona/Makefile`                   | [openwrt/packages](https://github.com/openwrt/packages) `net/v2ray-geodata` (data-only, `PKGARCH:=all`, `Download/` blocks) and `net/v2raya` (unpacking a release tarball in `Build/Prepare`)                                   |
| `alpine/APKBUILD`                          | [aports](https://gitlab.alpinelinux.org/alpine/aports) `community/font-noto-cjk` (noarch, subpackage)                                                                                                                           |
| `nix/package.nix`                          | [nixpkgs](https://github.com/NixOS/nixpkgs) `pkgs/by-name/da/daed/package.nix` (the `web` derivation: `fetchPnpmDeps`, `pnpmConfigHook`, `pnpm build`) and the pnpm section of `doc/languages-frameworks/javascript.section.md` |
| the AUR `doona-bin` (separate repository)  | v2rayA's `install/aur/v2raya-bin/PKGBUILD`                                                                                                                                                                                      |

The OpenWrt, Alpine and Nix recipes are unpublished templates. Replace every marked hash before submission;
none is ready for distribution. OpenWrt uses `SHA256SUMS`, Alpine uses `abuild checksum`, and Nix needs the
source hash from `nix-prefetch-github` and the dependency hash from the first build's mismatch message.

The release workflow runs `tools/package.sh --git-version`: tag `v0.3.0.beta.1` produces
`doona-v0.3.0.beta.1.tar.gz` and `doona-fonts-v0.3.0.beta.1.tar.gz`, matching the binary recipes.
The program archive has `index.html`, assets and notices at its root. The separate font archive has a
`fonts/` directory containing the subsets, `OFL.txt` and `README`. OpenWrt and Alpine unpack these into
separate staging directories and install them under `/usr/share/doona` and `/usr/share/doona/fonts`.
Nix builds the source tag instead, using `make install` and optional `make install-fonts` under `$out/share/doona`.
The default local invocation uses `package.json` instead, so its archive names omit the leading `v`.
