Fixed

- Test all on the Nodes page tests only the listed nodes with a supported probe, counts only those in its summary, and is disabled when none can be tested.
- A policy group's test summary reports a failed or inconclusive test as such instead of always as a success.
- Engine-specific group settings that hold objects or lists show their JSON text instead of `[object Object]`.
- A group filter such as `name(keyword: harbor)` no longer blocks renaming or removing a subscription tagged `harbor`; only `subtag(...)` arguments count.
