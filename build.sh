#!/bin/sh
# Build on the no-snapshot SSD: node_modules and dist never touch the snapshotted home dataset.
# DOONA_BUILD picks the build directory so parallel worktrees do not overwrite each other.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
B="${DOONA_BUILD:-/scratch/ssd/doona-build}"
mkdir -p "$B"
rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude vendor --exclude artifact --exclude .agents --exclude .claude "$SRC/" "$B/"
cd "$B"
[ -d node_modules ] || { pnpm install; pnpm approve-builds --all >/dev/null 2>&1 || true; pnpm install; }
pnpm "${1:-build}"
