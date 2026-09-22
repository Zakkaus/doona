#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
case "$#:$*" in
    0:) version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version') ;;
    1:--git-version) version=$(git describe --tags --always) ;;
    *) echo "Usage: $0 [--git-version]" >&2; exit 1 ;;
esac
case "$version" in
    ''|*[!A-Za-z0-9._+-]*) echo "Invalid archive version: $version" >&2; exit 1 ;;
esac
SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct)}
case "$SOURCE_DATE_EPOCH" in
    ''|*[!0-9]*) echo 'SOURCE_DATE_EPOCH must be a Unix timestamp' >&2; exit 1 ;;
esac
[ -f dist/index.html ] && [ -d dist/fonts ] || {
    echo 'Build dist/ with pnpm build before packaging' >&2
    exit 1
}

export LC_ALL=C
umask 022
mkdir -p release
stage=$(mktemp -d "$PWD/release/.package.XXXXXX")
trap 'rm -rf "$stage"' 0
trap 'exit 1' HUP INT TERM
mkdir "$stage/program" "$stage/font-package"
for entry in dist/* dist/.[!.]* dist/..?*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    [ "$entry" != dist/fonts ] || continue
    # The Vite build manifest only serves the size check.
    [ "$entry" != dist/.vite ] || continue
    cp -R "$entry" "$stage/program/"
done
cp LICENSE NOTICE CHANGELOG.md README.md "$stage/program/"
mkdir "$stage/program/LICENSES"
cp LICENSES/Apache-2.0.txt "$stage/program/LICENSES/"
cp -R dist/fonts "$stage/font-package/"

archive() {
    # Keep tar separate from gzip so POSIX sh detects failures in either command.
    tar --sort=name --owner=0 --group=0 --numeric-owner \
        --mtime="@$SOURCE_DATE_EPOCH" --format=gnu -cf "$stage/archive.tar" -C "$1" .
    gzip -n < "$stage/archive.tar" > "$stage/$2"
}
program="doona-$version.tar.gz"
fonts="doona-fonts-$version.tar.gz"
archive "$stage/program" "$program"
archive "$stage/font-package" "$fonts"
(cd "$stage" && sha256sum "$program" "$fonts" > SHA256SUMS)
mv "$stage/$program" "$stage/$fonts" "$stage/SHA256SUMS" release/
printf 'Created release/%s, release/%s and release/SHA256SUMS\n' "$program" "$fonts"
