Fixed

- The contract types a group's `check_url` read back with listener secrets masked as `<redacted>`.
- A group's check URL that carries a masked listener secret can be replaced again; the dialog no longer sends a test the engine always refuses, and refuses a URL that still contains `<redacted>`.
