Pin: api-standardize e6b0dbab5599689d965bc18a71be67c809d99d0f + honk 3ae980fed extension

SHA-256: 9f780ba92f13218ed7bc52e9a9af79a960d241ce6552a45522b41c30fc04faa0

openapi.yaml combines api-standardize `source/openapi.yaml` at commit
e6b0dbab5599689d965bc18a71be67c809d99d0f with the unchanged
`ConfigSource.read_only_reason` extension from Glassyiris/honk `feat/native-api`,
commit 3ae980fed, `crates/honk-core/tests/fixtures/native_api_openapi.yaml`.
Only the authoritative stream_transport schema and node-list example additions were
applied to the previous vendored fixture. The hash above identifies this local bundle,
not a new honk fixture commit or the contract shipped in doona beta.17.
The bundle also adds MaskedHttpUrl, the type of a check_url read back with listener
secrets masked; honk's fixture mirrors it byte for byte.

Regenerate src/api/types.ts with `pnpm gen:api`.
