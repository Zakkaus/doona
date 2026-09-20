#!/bin/sh
# The version fields behind a tag: v0.1.0 -> VERSION=0.1.0, PRERELEASE= ; v0.1.0.beta.2 -> VERSION=0.1.0,
# PRERELEASE=beta.2, and NPM (the package.json form) 0.1.0-beta.2. The tag shape follows honk's.
set -eu
tag=${1:?usage: tools/version.sh vX.Y.Z[.pre.N]}
case "$tag" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "unexpected tag: $tag" >&2; exit 1 ;;
esac
bare=${tag#v}
case "$bare" in
    *[!0-9a-z.]*) echo "tag may hold digits, lower-case letters and dots only: $tag" >&2; exit 1 ;;
esac
version=$(printf '%s' "$bare" | cut -d. -f1-3)
pre=${bare#"$version"}
pre=${pre#.}
printf 'VERSION=%s\nPRERELEASE=%s\nNPM=%s\n' "$version" "$pre" "$version${pre:+-$pre}"
