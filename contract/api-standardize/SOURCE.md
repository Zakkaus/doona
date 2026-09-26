Pin: 21d3de7

openapi.yaml is the generated bundle (`npm run bundle`) of daeuniverse/api-standardize, branch feat/config-source-create, commit 21d3de7 (PR #30, not yet merged).

The merged changes include PR #4 client fixes, #5 config, #6 observability and management, #7 connection close, and #8 GroupOverrideCleared with the native outbound mode dropped.
They also include #9 rule source IDs, #12 recorder modes and unredacted administrative data, #13 password authentication (8 to 128 characters), #14 DNS cache usage by entry count, #15 configurable geodata sources with automatic updates and update status, #16 flow demand, #17 short DNS pages, and #18 geodata seeding from the configuration file.
They also include #19 schema gaps (GET /nodes/{id}, the logs replay age limit, snapshot_unavailable as a retryable 503), #20 a public discovery view for callers the listener does not admit, #21 early eviction of completed operations, #22 Retry-After on rules and trace 503, #23 the route geodata downloads take, #24 automatic geodata updates on by default, #25 routing as the default download route, and #27 the update interval, User-Agent and cache options for a new subscription.
The draft #30 adds POST /config/sources and resources.config.create for a new source file that an include loads.

Regenerate src/api/types.ts with `pnpm gen:api`.
