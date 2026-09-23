Pin: 01a6575 + 952e2e0 (PR #12) + 4cc28f4 and 62cfa46 (password login)

openapi.yaml is the generated bundle (`npm run bundle`) of daeuniverse/api-standardize, branch honk, commit 01a6575 plus PR #12 (`952e2e0`, recorder modes and the unredacted administrative surface, open as of 2026-09-22) plus `4cc28f4` and `62cfa46` on branch `auth-password-login` (password setup, login and logout with auth discovery, matching honk's password mode; passwords of 8 to 128 characters; not yet proposed upstream as of 2026-09-23).

That commit includes, all merged: PR #4 client fixes, #5 config, #6 observability with provider, node and geodata management, #7 connection close, #8 GroupOverrideCleared with the native outbound mode dropped.

Regenerate src/api/types.ts with `pnpm gen:api`.
