# Security Policy

## Supported versions

During pre-release, the project supports only `main`.

| Version | Supported |
| ------- | --------- |
| `main`  | Yes       |

## Report a vulnerability

Report vulnerabilities through a private GitHub security advisory for this repository. Do not open a public issue for a suspected vulnerability.

Include the affected commit, browser, backend configuration, reproduction steps, and impact when available.

## Scope

This policy covers the UI, its build, and its handling of backend tokens. API requests send bearer tokens in an `Authorization` header. Pairing links may carry a token in the URL fragment and remove it on load. The runtime API client makes no third-party requests.

## Response

The project does not guarantee an acknowledgement or resolution time.
