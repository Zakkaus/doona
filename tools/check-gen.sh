#!/bin/sh
set -eu

# SOURCE.md pins the bundle it describes; an edited or replaced bundle must update the pin with it.
pinned=$(sed -n 's/^SHA-256: //p' contract/api-standardize/SOURCE.md)
actual=$(sha256sum contract/api-standardize/openapi.yaml | cut -d' ' -f1)
if [ "$pinned" != "$actual" ]; then
  echo "contract/api-standardize/openapi.yaml is $actual, but SOURCE.md pins ${pinned:-nothing}." >&2
  exit 1
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' 0
trap 'exit 1' HUP INT TERM

OPENAPI_OUTPUT="$tmp" pnpm gen:api
if ! diff -u src/api/types.ts "$tmp"; then
  echo 'API types differ from the contract; run pnpm gen:api.' >&2
  exit 1
fi
