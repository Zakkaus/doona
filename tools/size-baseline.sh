#!/usr/bin/env bash
# Usage: tools/size-baseline.sh <owner/repo> <base sha or empty> <directory>
# Downloads main's size measurement into <directory>/size-report.json: the one from main's Check run on the base commit, else
# the one from main's newest successful Check run that still has it. The report names which commit it came from. Without one,
# or when the API fails, it writes nothing and exits 0, so the report shows no baseline instead of failing the run. Needs
# GH_TOKEN with actions: read.
set -uo pipefail

repo=$1
base=$2
dir=$3
mkdir -p "$dir"
[[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 0
[[ $base =~ ^[0-9a-f]{40}$ ]] || base=
for tool in gh unzip; do
  command -v "$tool" >/dev/null || { echo "::warning::size-baseline.sh needs $tool; the report has no baseline" >&2; exit 0; }
done

# Main's own runs: Check runs only on pushes to main and on pull requests, and a pull request from a fork's main branch has a
# different head repository.
main='select(.workflow_run.head_branch == "main" and .workflow_run.head_repository_id == .workflow_run.repository_id)'
id=
if [[ -n $base ]]; then
  for run in $(gh api "repos/$repo/actions/workflows/check.yml/runs?head_sha=$base&branch=main&per_page=20" \
    --jq '.workflow_runs[] | select(.event != "pull_request") | .id' 2>/dev/null); do
    id=$(gh api "repos/$repo/actions/runs/$run/artifacts?name=size-report" \
      --jq "[.artifacts[] | select(.expired | not) | $main] | .[0].id // empty" 2>/dev/null)
    [[ -n $id ]] && break
  done
fi
if [[ -z $id ]]; then
  # Main's newest successful Check runs, the first of which that still has its artifact.
  for run in $(gh api "repos/$repo/actions/workflows/check.yml/runs?branch=main&event=push&status=success&per_page=20" \
    --jq '.workflow_runs[] | .id' 2>/dev/null); do
    id=$(gh api "repos/$repo/actions/runs/$run/artifacts?name=size-report" \
      --jq "[.artifacts[] | select(.expired | not) | $main] | .[0].id // empty" 2>/dev/null)
    [[ -n $id ]] && break
  done
fi
[[ $id =~ ^[0-9]+$ ]] || exit 0

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
gh api "repos/$repo/actions/artifacts/$id/zip" >"$scratch/artifact.zip" 2>/dev/null || exit 0
unzip -p "$scratch/artifact.zip" size-report.json 2>/dev/null | head -c 1048576 >"$scratch/size-report.json" || exit 0
[[ -s $scratch/size-report.json ]] && mv "$scratch/size-report.json" "$dir/size-report.json"
exit 0
