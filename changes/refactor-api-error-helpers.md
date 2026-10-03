Internal

- The API client shares one Retry-After parser and one snapshot refusal check instead of repeating them per call site.
