Fixed

- Test all on the Nodes page tests only the listed nodes with a supported probe, counts only those in its summary, and is disabled when none can be tested.
- A policy group's test summary reports a failed or inconclusive test as such instead of always as a success.
- Engine-specific group settings that hold objects or lists show their JSON text instead of `[object Object]`.
- A group filter such as `name(keyword: harbor)` no longer blocks renaming or removing a subscription tagged `harbor`; only `subtag(...)` arguments count.
- In the config editor, completion after `->` or `fallback:` inside `dns` offers the defined upstreams with `asis` and `reject` for requests, or `accept` and `reject` for responses, instead of traffic outbounds.
- In the demo backend, adding a node or subscription to a configuration without a `node` or `subscription` section creates the section instead of silently writing nothing.
