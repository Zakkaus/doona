Pin: honk 3ae980fed

SHA-256: 9f1c20e206b71b87c0c646f6b61027118d1c6598f5ac838ccb543254b1f8c611

openapi.yaml is the native API contract fixture from Glassyiris/honk `feat/native-api`, commit
3ae980fed, `crates/honk-core/tests/fixtures/native_api_openapi.yaml`. It adds source read-only
reasons to the api-standardize bundle previously pinned at 1fb08ad. The file is unchanged from
the earlier pin df4801cc8, which the branch's rebase onto daeuniverse/honk main rewrote.

Regenerate src/api/types.ts with `pnpm gen:api`.
