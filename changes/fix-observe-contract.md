Fixed

- Flow trace steps show the error the backend reports, and DNS steps show the query type and answer status.
- Events link to the recording settings and the configuration page only when the backend offers them.
- The event capture note shows the engine's grace period instead of always saying 60 s.
- Regex filter previews fall back to the pattern text when it has more than three variable-length repetitions (`*`, `+`, `?`, `{m,n}`), which could stall the page.
