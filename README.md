<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**Static web UI for the [daeuniverse](https://github.com/daeuniverse) engines: manage nodes, groups, rules and configuration in a browser.**

**[Live demo](https://demo.daeuniverse.org/)** / **[Documentation](https://zakkaus.github.io/doona-docs/en/)**

English / [简体中文](README.zh-CN.md) / [繁體中文](README.zh-TW.md)

[Two editions](#two-editions) / [Try the demo](#try-the-demo) / [Install](#install) / [Backend protocols](#backend-protocols) / [Documentation](#documentation)

</div>

doona is a static web UI for managing a proxy backend. Real data requires a compatible running backend with its native API enabled; currently, doona supports [honk](https://github.com/daeuniverse/honk). dae is not supported yet; compatibility depends on a future implementation of the same API contract. honk or another web server can serve the UI.

Depending on the features exposed by your backend, doona lets you:

- Monitor traffic, connections, events and logs.
- Manage nodes and subscriptions, refresh subscriptions and inspect probe results.
- Manage groups, their members and node selection.
- Inspect routing and DNS rules, and edit rules in writable sources.
- Edit configuration source files, validate changes and export sources.

## Two editions

The standard edition monitors traffic and manages the whole configuration. doona lite edits nodes, subscriptions, groups, routing, DNS and global settings, and has no traffic pages. Both connect to the same honk with the same administrator credentials.

See the [edition comparison](https://zakkaus.github.io/doona-docs/en/editions.html) for features, backend requirements and switching editions.

<img src="https://zakkaus.github.io/doona-docs/images/lite-nodes-light.webp" width="100%" alt="The doona lite Nodes page">

## Try the demo

[Open the demo](https://demo.daeuniverse.org/) to try the UI with sample data; no backend is needed. To see error states, use [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults); `?scenario=` returns to the healthy demo.

Try [the lite demo](https://demo.daeuniverse.org/lite/) to explore the smaller configuration editor.

## Install

Start with a honk build that provides the native API; the [installation guide](https://zakkaus.github.io/doona-docs/en/install.html#install) lists compatible builds and setup steps. Then download `doona-<version>.tar.gz` from the [releases page](https://github.com/Zakkaus/doona/releases).
Extract it into the directory that honk's `native_api` block names in `ui`; honk serves doona at `/ui/`.
The same release provides `doona-lite-<version>.tar.gz`; extract it to its own directory, `/usr/share/doona-lite`, and use `ui` to select the edition as described in the [lite guide](https://zakkaus.github.io/doona-docs/en/lite.html).
Editing settings and configuration requires write permission on the backend. See [package details](docs/install.md) for archive contents.

## Backend protocols

honk handles proxying, so protocol support depends on the backend version and build. Its proxy protocols include SOCKS5, Shadowsocks/2022, Trojan, VMess, VLESS, AnyTLS, Hysteria2, TUIC and Juicity; see the [honk node reference](https://github.com/daeuniverse/honk/blob/main/doc/en/reference/nodes.md#protocols) for supported options and limits.

WebSocket, gRPC and XHTTP are stream transports, separate from proxy protocols. On honk versions with XHTTP support, Trojan/VMess/VLESS use the [H2 XHTTP profile](https://github.com/daeuniverse/honk/blob/main/doc/en/reference/nodes.md#xhttp-over-h2), with no H1/H3 fallback; the reference lists supported combinations and limitations.

![The Activity page](https://zakkaus.github.io/doona-docs/screenshots/en/activity-light.webp)

![Editing the width and height of an Activity card](https://zakkaus.github.io/doona-docs/screenshots/en/dashboard-settings.webp)

![Editing a policy group](https://zakkaus.github.io/doona-docs/screenshots/en/group-editor.webp)

![Routing rules in the advanced list](https://zakkaus.github.io/doona-docs/screenshots/en/rules-advanced.webp)

![Editing a configuration source file](https://zakkaus.github.io/doona-docs/screenshots/en/config-source-light.webp)

## Latest release

[0.1.0-rc.2](CHANGELOG.md) has 41 entries: 4 additions, 9 changes, 23 fixes and 5 internal updates.

It adds doona lite, a smaller configuration editor shipped in its own archive. The Nodes page takes several node links at once and tests the filtered list, sorted by latency, and the route trace accepts a firewall mark. A first run opens a connection form in Settings, and up to four recently left pages reopen as they were. Suspending the service, clearing logs, switching to Direct or Global mode and leaving an unapplied rule template or group draft now ask for confirmation.

## Documentation

- [Installation and packages](docs/install.md): [简体中文](docs/install.zh-CN.md) / [繁體中文](docs/install.zh-TW.md)
- [Pages, page tour and phone layout](docs/pages.md): [简体中文](docs/pages.zh-CN.md) / [繁體中文](docs/pages.zh-TW.md)
- [Themes and palettes](docs/themes.md): [简体中文](docs/themes.zh-CN.md) / [繁體中文](docs/themes.zh-TW.md)
- [Fonts](docs/fonts.md)
- [Country flags](docs/country-flags.md)
- [Changelog](CHANGELOG.md)
- [Documentation site](https://zakkaus.github.io/doona-docs/en/)

## Development

The build, test and packaging commands, the source layout and the contract pin are on the [development page](https://zakkaus.github.io/doona-docs/en/development.html). See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

For lite’s separate dependency install and build commands, see [Development](https://zakkaus.github.io/doona-docs/en/development.html#doona-lite).

## Support

Report bugs and ask questions in the [issues](https://github.com/Zakkaus/doona/issues). Report backend issues to the connected engine's project: [honk](https://github.com/daeuniverse/honk) or [dae](https://github.com/daeuniverse/dae). See [SECURITY.md](.github/SECURITY.md) for reporting a vulnerability.

## License and credits

[GPL-3.0-only](LICENSE). [Noto Sans TC and SC](docs/fonts.md), bundled from Fontsource npm packages, are copyright Adobe and licensed under the [Open Font License](LICENSES/OFL-1.1.txt); [NOTICE](NOTICE) credits the Adobe Spectrum icons (Apache-2.0).
