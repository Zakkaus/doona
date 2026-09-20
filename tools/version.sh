#!/bin/sh
# The version fields behind a tag: v0.1.0 -> VERSION=0.1.0, PRERELEASE= ; v0.1.0.beta.2 -> VERSION=0.1.0,
# PRERELEASE=beta.2, and NPM (the package.json form) 0.1.0-beta.2. The tag shape follows honk's.
set -eu
tag=${1:?usage: tools/version.sh vX.Y.Z[.pre.N]}
bare=${tag#v}
# Three numbers, then nothing or a lower-case label and a number: v0.1.0, v0.1.0.beta.2.
printf '%s\n' "$bare" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(\.[a-z]+\.[0-9]+)?$' || {
    echo "unexpected tag: $tag (want vX.Y.Z or vX.Y.Z.label.N)" >&2
    exit 1
}
version=$(printf '%s' "$bare" | cut -d. -f1-3)
pre=${bare#"$version"}
pre=${pre#.}
printf 'VERSION=%s\nPRERELEASE=%s\nNPM=%s\n' "$version" "$pre" "$version${pre:+-$pre}"
