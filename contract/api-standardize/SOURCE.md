Pin: api-standardize e6b0dbab5599689d965bc18a71be67c809d99d0f + honk 3ae980fed extension

SHA-256: bc7599a8b693a8a28b64704764cc3b2577b93707b425c66d5d9436b60a50ecac

openapi.yaml combines api-standardize `source/openapi.yaml` at commit
e6b0dbab5599689d965bc18a71be67c809d99d0f with the unchanged
`ConfigSource.read_only_reason` extension from Glassyiris/honk `feat/native-api`,
commit 3ae980fed, `crates/honk-core/tests/fixtures/native_api_openapi.yaml`.
Only the authoritative stream_transport schema and node-list example additions were
applied to the previous vendored fixture. The hash above identifies this local bundle,
not a new honk fixture commit or the contract shipped in doona beta.17.
The bundle also adds MaskedHttpUrl, the type of a check_url read back with listener
secrets masked; honk's fixture mirrors it byte for byte.
The geodata auto_update `cron` schedule mirrors the fixture of daeuniverse/honk
pull request 484 and is not yet in api-standardize; the bundle keeps `cron`
optional, as with verify_checksum, because older engines omit it, and leaves out its
`default`, which would make the generated type require it.
The bundle drops the `pattern` of ProviderCreate.name ahead of the matching
api-standardize and honk changes: a subscription tag may be any text the
configuration can quote, and names outside [A-Za-z0-9_.-] are written quoted.

Regenerate src/api/types.ts with `pnpm gen:api`.
