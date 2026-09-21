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

The hashes and versions inside them are filled in at each release: `PKG_HASH` from `SHA256SUMS`, `sha512sums`
with `abuild checksum`, the Nix `src` hash with `nix-prefetch-github` and the `pnpmDeps` hash from the first
build's mismatch message.
