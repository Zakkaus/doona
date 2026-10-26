#!/bin/sh
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)
out=${TMPDIR:-/tmp}/doona-demo
push=false
while [ "$#" -gt 0 ]; do
    case "$1" in
        --out)
            [ "$#" -ge 2 ] && [ -n "$2" ] || { echo '--out requires a directory' >&2; exit 1; }
            out=$2
            shift 2
            ;;
        --push) push=true; shift ;;
        *) echo "Usage: $0 [--out directory] [--push]" >&2; exit 1 ;;
    esac
done
out=$(realpath -m -- "$out")
case "$out/" in "$root/"*) echo 'Output must be outside the checkout' >&2; exit 1 ;; esac
case "$root/" in "$out/"*) echo 'Output must not contain the checkout' >&2; exit 1 ;; esac
# Vite clears the output directory. Only replace a previous demo build.
if [ -d "$out" ] && [ -n "$(ls -A -- "$out")" ]; then
    [ -f "$out/.nojekyll" ] && [ -f "$out/CNAME" ] && [ "$(cat "$out/CNAME")" = demo.daeuniverse.org ] || {
        echo "Refusing to clear a non-demo directory: $out" >&2
        exit 1
    }
fi

cd "$root"
pnpm build --outDir "$out" --emptyOutDir
(cd "$root/apps/lite" && VITE_LITE_DEMO=1 pnpm build --base ./ --outDir "$out/lite" --emptyOutDir)
node --input-type=module - "$root/tools/demo-snippet.html" "$out/index.html" <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
const [, , snippetPath, indexPath] = process.argv;
const html = readFileSync(indexPath);
const before = html.indexOf('<script');
if (before === -1) throw new Error('The doona index has no script to inject before');
writeFileSync(indexPath, Buffer.concat([html.subarray(0, before), readFileSync(snippetPath), html.subarray(before)]));
JS
touch "$out/.nojekyll"
printf '%s\n' demo.daeuniverse.org > "$out/CNAME"
du -sh -- "$out"

if "$push"; then
    remote=$(git -C "$root" remote get-url --push origin)
    checkout=$(mktemp -d)
    trap 'rm -rf -- "$checkout"' 0
    trap 'exit 1' HUP INT TERM
    cp -R -- "$out/." "$checkout/"
    git -C "$checkout" init --initial-branch=gh-pages
    git -C "$checkout" add --all
    git -C "$checkout" commit -m 'build(demo): publish doona and lite'
    git -C "$checkout" push --force "$remote" HEAD:refs/heads/gh-pages
fi
