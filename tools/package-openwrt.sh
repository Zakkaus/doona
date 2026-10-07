#!/bin/sh
# Builds the OpenWrt apk packages from install/openwrt/doona/Makefile and the archives in release/, in the OpenWrt SDK
# container (any target: the packages are PKGARCH all):
#   docker run --rm -v "$PWD:/src" -w /src openwrt/sdk:x86-64-25.12.5 sh tools/package-openwrt.sh 0.1.0-beta.18
# The SDK signs only the package index, with a key generated for this run. release/openwrt/ receives the packages
# under the names that index records, the index as doona-openwrt.adb and its public key as doona-openwrt.pem;
# release/openwrt-recipe/ receives the Makefile with this version and the hashes of these archives.
set -eu

cd "$(dirname "$0")/.."
[ "$#" -eq 1 ] || { echo "Usage: $0 <version>" >&2; exit 1; }
eval "$(tools/version.sh "v$1")"
pkgver=$VERSION${ARCH_PRERELEASE:+_$ARCH_PRERELEASE}
for name in doona doona-fonts doona-precompressed; do
    [ -f "release/$name-$NPM.tar.gz" ] || { echo "Missing release/$name-$NPM.tar.gz; run tools/package.sh first" >&2; exit 1; }
done
repo=$PWD
sdk=${OPENWRT_SDK:-/builder}

mkdir -p "$sdk/package/doona" "$sdk/dl"
# The archives in dl/ stand in for the downloads.
sed "s/^PKG_REAL_VERSION:=.*/PKG_REAL_VERSION:=$NPM/" install/openwrt/doona/Makefile > "$sdk/package/doona/Makefile"
cp "release/doona-$NPM.tar.gz" "release/doona-fonts-$NPM.tar.gz" "release/doona-precompressed-$NPM.tar.gz" "$sdk/dl/"

cd "$sdk"
printf 'CONFIG_PACKAGE_%s=m\n' doona doona-fonts doona-precompressed >> .config
make defconfig
# FIXUP=1 writes the archives' hashes into the Makefile, as a maintainer does after a version bump.
make package/doona/check FIXUP=1 V=s
make package/doona/compile package/index V=s

pkgrel=$(sed -n 's/^PKG_RELEASE:=//p' "$repo/install/openwrt/doona/Makefile")
mkdir -p "$repo/release/openwrt"
for name in doona doona-fonts doona-precompressed; do
    cp bin/packages/*/base/"$name-$pkgver-r$pkgrel.apk" "$repo/release/openwrt/"
done
cp bin/packages/*/base/packages.adb "$repo/release/openwrt/doona-openwrt.adb"
cp public-key.pem "$repo/release/openwrt/doona-openwrt.pem"
mkdir -p "$repo/release/openwrt-recipe"
cp package/doona/Makefile "$repo/release/openwrt-recipe/"
ls -l "$repo/release/openwrt"
