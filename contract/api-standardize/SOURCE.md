Pin: honk df4801cc8

SHA-256: 9f1c20e206b71b87c0c646f6b61027118d1c6598f5ac838ccb543254b1f8c611

openapi.yaml is the native API contract fixture from daeuniverse/honk, commit df4801cc8,
`crates/honk-core/tests/fixtures/native_api_openapi.yaml`. It adds source read-only reasons
to the api-standardize bundle previously pinned at 1fb08ad.

Regenerate src/api/types.ts with `pnpm gen:api`.
