#!/bin/sh
# Builds the Alpine packages from install/alpine/APKBUILD and the archives in release/, as root in an Alpine container:
#   docker run --rm -v "$PWD:/src" -w /src alpine:3.24 sh tools/package-alpine.sh 0.1.0-beta.13
# abuild signs each package with a key generated for this run; release/alpine/ receives the packages and the public
# key as doona-alpine.rsa.pub, and release/alpine-recipe/ the APKBUILD with this version and its checksums.
set -eu

cd "$(dirname "$0")/.."
[ "$#" -eq 1 ] || { echo "Usage: $0 <version>" >&2; exit 1; }
eval "$(tools/version.sh "v$1")"
pkgver=$VERSION${ARCH_PRERELEASE:+_$ARCH_PRERELEASE}
for name in doona doona-fonts doona-precompressed; do
    [ -f "release/$name-$NPM.tar.gz" ] || { echo "Missing release/$name-$NPM.tar.gz; run tools/package.sh first" >&2; exit 1; }
done

apk add --no-cache --quiet abuild
work=$(mktemp -d)
trap 'rm -rf "$work"' 0
trap 'exit 1' HUP INT TERM
# abuild names the repository after the APKBUILD's grandparent directory.
mkdir -p "$work/alpine/doona" "$work/distfiles"
cp "release/doona-$NPM.tar.gz" "release/doona-fonts-$NPM.tar.gz" "release/doona-precompressed-$NPM.tar.gz" "$work/distfiles/"
sed "s/^pkgver=.*/pkgver=$pkgver/" install/alpine/APKBUILD > "$work/alpine/doona/APKBUILD"

# apk finds the key by the file name abuild records in each signature, so it takes a fixed name.
export PACKAGER='Zakkaus <zakk@gentoozh.org>'
abuild-keygen -n -q
mv "$HOME"/.abuild/*.rsa "$work/doona-alpine.rsa"
mv "$HOME"/.abuild/*.rsa.pub "$work/doona-alpine.rsa.pub"
export PACKAGER_PRIVKEY="$work/doona-alpine.rsa"
# abuild checks the packages against the trusted keys when it indexes them.
cp "$work/doona-alpine.rsa.pub" /etc/apk/keys/
export SRCDEST="$work/distfiles" REPODEST="$work/packages"

(cd "$work/alpine/doona" && abuild -F checksum && abuild -F -d)

pkgrel=$(sed -n 's/^pkgrel=//p' install/alpine/APKBUILD)
mkdir -p release/alpine
for package in "$REPODEST"/alpine/*/*.apk; do
    name=${package##*/}
    name=${name%-"$pkgver-r$pkgrel".apk}
    cp "$package" "release/alpine/$name-$NPM-r$pkgrel.alpine.apk"
done
cp "$work/doona-alpine.rsa.pub" release/alpine/
mkdir -p release/alpine-recipe
cp "$work/alpine/doona/APKBUILD" release/alpine-recipe/
ls -l release/alpine
