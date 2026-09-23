#!/bin/sh
# A stable tag has no prerelease; v0.1.0-beta.2 yields VERSION=0.1.0 and PRERELEASE=beta.2.
set -eu
tag=${1:?usage: tools/version.sh vX.Y.Z[-pre.N]}
case "$tag" in
    v*) ;;
    *) echo "unexpected tag: $tag (want vX.Y.Z or vX.Y.Z-pre.N)" >&2; exit 1 ;;
esac
bare=${tag#v}
printf '%s\n' "$bare" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?$' || {
    echo "unexpected tag: $tag (want vX.Y.Z or vX.Y.Z-pre.N)" >&2
    exit 1
}
version=${bare%%-*}
pre=${bare#"$version"}
pre=${pre#-}
printf 'VERSION=%s\nPRERELEASE=%s\nNPM=%s\n' "$version" "$pre" "$version${pre:+-$pre}"
