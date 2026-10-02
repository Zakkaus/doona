Internal

- Contributors add per-PR changelog fragments; release tooling resolves PR numbers and collects entries without conflicts in the shared changelog.
- CI exempts test- and documentation-only changes from fragment requirements without changing check lanes, validates committed fragments with the release parser, and release tooling preserves literal replacement tokens in entries.
