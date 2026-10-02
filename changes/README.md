# Changelog fragments

For each pull request, add one Markdown file named after the branch slug: replace `/` and other non-alphanumeric characters with `-`, use lowercase, and collapse repeated hyphens. For example, `fix/dns-worker-timeout` becomes `changes/fix-dns-worker-timeout.md`.

The first line is one of `Added`, `Changed`, `Fixed`, `Removed`, `Security`, or `Internal`. Follow it with one or more `- ` bullet lines, each describing a change. Blank lines are allowed. Do not add a PR number: the renderer looks up the commit that added the fragment.

```markdown
Fixed

- DNS workers stop waiting when a request times out.
- Retrying a timed-out request starts a new worker.
```

```markdown
Internal

- Contributors write changelog fragments instead of editing the shared Unreleased section.
```

Use `Internal` for contributor-facing changes. Fragments are grouped as Added, Changed, Fixed, Removed, Security, then Internal, with filenames sorted within each group. `README.md` is not a fragment.

PRs that touch shipped code in `src/`, `mock/`, `install/`, or `public/` must add a new fragment. Modifying or renaming an existing fragment does not count. Test-only changes (`*.test.ts`, `*.test.tsx`, `*.test.mjs`, and e2e specs) and documentation-only changes (`*.md` except `CHANGELOG.md`) do not require one; their check lanes stay unchanged. A PR that also changes shipped code still needs a fragment. Maintainers can apply the `no-changelog` label when an entry is unnecessary.

CI validates every added or changed fragment from the PR head with the release parser, including fragment-only PRs and PRs labeled `no-changelog`. Invalid fragments fail with their filename and the parser's reason.

## Preview and release

From the repository root, with Node and pnpm installed:

```sh
pnpm changelog:render
```

This prints the generated `## [Unreleased]` section without changing files. Install and authenticate [GitHub CLI](https://cli.github.com/) to include PR numbers. The renderer uses `gh api repos/{owner}/{repo}/commits/{sha}/pulls` for the commit that added each fragment; it prefers a merged PR when GitHub returns several. If Git history or GitHub is unavailable, it warns on stderr and leaves the number out.

After the existing handwritten Unreleased entries have been released, collect fragments for a release:

```sh
pnpm changelog:release 0.1.0-beta.14 2026-10-10
```

This creates `## [0.1.0-beta.14] - 2026-10-10` in `CHANGELOG.md`, updates its comparison links, and deletes the consumed fragments. The Unreleased heading and fragment note remain. It refuses to overwrite handwritten Unreleased entries. Review warnings before publishing: offline release entries have no PR numbers. Commit the changelog and fragment deletions with the other release changes; this command does not update the package version or create a tag.
