Fixed

- A connection test that cannot reach the backend shows the network or cross-origin advice again, with a link to the matching docs section, instead of HTTP 0.
- Missing offline files, refused routing templates, locked group edits, failed geodata saves and updates, and lost persistence on System status link the docs section that explains the fix.
- A refused template whose write needs no geodata still links the docs on files the configuration needs.
- System status keeps the backend's reason for an unavailable state database or state cache.
- Lite links the docs from read-only notes, unavailable pages, refused and rejected changes, failed latency tests and route tests, failed subscription updates, and a disconnected, degraded or failed backend.
- Lite toasts and banners keep the validator's or backend's reason for a rejected change or a failed operation, a failed subscription update shows its last error, and the backend menu shows why it is disconnected, degraded or failed.
