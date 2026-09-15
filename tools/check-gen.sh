#!/bin/sh
set -eu

tmp=$(mktemp)
trap 'rm -f "$tmp"' 0
trap 'exit 1' HUP INT TERM

OPENAPI_OUTPUT="$tmp" pnpm gen:api
if ! diff -u src/api/types.ts "$tmp"; then
  echo 'API types differ from the contract; run pnpm gen:api.' >&2
  exit 1
fi
