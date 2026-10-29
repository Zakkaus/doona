Fixed

- A routing block that holds only a `default:` fallback counts as holding no rules, like `fallback:`.
- The service picker recognises a fully quoted rule such as `domain('geosite:telegram')` and no longer inserts the service again.
- The service picker no longer queues `domain(geosite:steam@cn)` when a held rule already has it.
