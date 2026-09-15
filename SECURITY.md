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

This policy covers the UI, its build, and its handling of backend tokens. The API client sends bearer tokens in an `Authorization` header and never places them in URLs. The runtime API client makes no third-party requests.

## Response

We aim to acknowledge reports within one week. This is not an SLA.
