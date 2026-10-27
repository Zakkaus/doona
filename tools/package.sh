#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
case "$#:$*" in
    0:) version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version') ;;
    1:--git-version) version=$(git describe --tags --always); version=${version#v} ;;
    *) echo "Usage: $0 [--git-version]" >&2; exit 1 ;;
esac
case "$version" in
    ''|*[!A-Za-z0-9._+-]*) echo "Invalid archive version: $version" >&2; exit 1 ;;
esac
SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct)}
case "$SOURCE_DATE_EPOCH" in
    ''|*[!0-9]*) echo 'SOURCE_DATE_EPOCH must be a Unix timestamp' >&2; exit 1 ;;
esac
[ -f dist/index.html ] && [ -d dist/fonts ] && [ -f apps/lite/dist/index.html ] || {
    echo 'Build dist/ with pnpm build and apps/lite/dist/ with pnpm -C apps/lite build before packaging' >&2
    exit 1
}
for tool in brotli gzip; do
    command -v "$tool" >/dev/null 2>&1 || {
        echo "Install $tool before packaging" >&2
        exit 1
    }
done

export LC_ALL=C
umask 022
mkdir -p release
[ ! -e "release/doona-$version-deps.tar.xz" ] || {
    echo "Remove the obsolete dependencies archive before packaging: release/doona-$version-deps.tar.xz" >&2
    exit 1
}
stage=$(mktemp -d "$PWD/release/.package.XXXXXX")
trap 'rm -rf "$stage"' 0
trap 'exit 1' HUP INT TERM
mkdir "$stage/program" "$stage/font-package" "$stage/precompressed"
# Copies a build directory without its fonts and Vite metadata used by size checks and notices.
copy_build() {
    for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        [ "$entry" != "$1/fonts" ] || continue
        [ "$entry" != "$1/.vite" ] || continue
        cp -R "$entry" "$2/"
    done
}
copy_build dist "$stage/program"
# The optional precompressed archive holds .br and .gz siblings of the staged dist assets, not of the licence and
# notice files added below.
(cd "$stage/program" && find . -type f -size +1023c \( \
    -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o \
    -name '*.json' -o -name '*.webmanifest' -o -name '*.txt' -o -name '*.map' \
    \) -print0) > "$stage/assets"
sort -z "$stage/assets" > "$stage/sorted-assets"
# A sibling is kept only when it is smaller than the original. The quoted script expands in the child shell.
# shellcheck disable=SC2016
(cd "$stage/program" && xargs -0 -r sh -ec '
    out=$1 sibling=$2
    shift 2
    for asset do
        size=$(wc -c < "$asset")
        for suffix in br gz; do
            if [ "$suffix" = br ]; then brotli -q 11 -c < "$asset" > "$sibling"; else gzip -9 -n < "$asset" > "$sibling"; fi
            [ "$(wc -c < "$sibling")" -lt "$size" ] || continue
            mkdir -p "$out/${asset%/*}"
            mv "$sibling" "$out/$asset.$suffix"
        done
    done
    rm -f "$sibling"
' sh "$stage/precompressed" "$stage/sibling" < "$stage/sorted-assets")
add_notices() {
    cp LICENSE NOTICE README.md README.en.md "$1/"
    # Adds LICENSES/ and THIRD-PARTY-NOTICES.txt, and fails if NOTICE cites a licence file left out.
    node tools/notices.mjs "$1" "$2/.vite/bundled-packages.json"
}
add_notices "$stage/program" dist
# doona lite unpacks beside the standard edition: index.html at the archive root, system fonts, no font archive.
mkdir "$stage/lite"
copy_build apps/lite/dist "$stage/lite"
add_notices "$stage/lite" apps/lite/dist
cp -R dist/fonts "$stage/font-package/"

archive() {
    # Keep tar separate from gzip so POSIX sh detects failures in either command.
    tar --sort=name --owner=0 --group=0 --numeric-owner \
        --mtime="@$SOURCE_DATE_EPOCH" --format=gnu -cf "$stage/archive.tar" -C "$1" .
    gzip -n < "$stage/archive.tar" > "$stage/$2"
}
program="doona-$version.tar.gz"
fonts="doona-fonts-$version.tar.gz"
precompressed="doona-precompressed-$version.tar.gz"
lite="doona-lite-$version.tar.gz"
archive "$stage/program" "$program"
archive "$stage/lite" "$lite"
archive "$stage/font-package" "$fonts"
archive "$stage/precompressed" "$precompressed"
(cd "$stage" && sha256sum "$program" "$fonts" "$precompressed" "$lite" > SHA256SUMS)
mv "$stage/$program" "$stage/$fonts" "$stage/$precompressed" "$stage/$lite" "$stage/SHA256SUMS" release/
printf 'Created release/%s, release/%s, release/%s, release/%s and release/SHA256SUMS\n' "$program" "$fonts" "$precompressed" "$lite"
