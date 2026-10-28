<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**Static web UI for the [daeuniverse](https://github.com/daeuniverse) engines: manage nodes, groups, rules and configuration in a browser.**

**[Live demo](https://demo.daeuniverse.org/)** / **[Lite demo (preview)](https://demo.daeuniverse.org/lite/)** / **[Documentation](https://doona.daeuniverse.org/en/)**

[繁體中文](README.md) / [简体中文](README.zh-CN.md) / English

[Features](#features) / [Two editions](#two-editions) / [Try the demo](#try-the-demo) / [Install](#install) / [Backend protocols](#backend-protocols) / [Documentation](#documentation)

</div>

doona is a static web UI for monitoring proxy traffic and managing nodes, groups, rules and configuration. It requires a running [honk](https://github.com/daeuniverse/honk) backend with the native API enabled; dae is not supported yet.

![Activity dashboard with traffic charts and status cards](https://doona.daeuniverse.org/screenshots/en/activity-light.webp)

## Features

### Monitor

- Edit the Activity dashboard’s cards and their sizes.
- Inspect connections, flow records and DNS queries.
- Read backend logs and events.

![Activity card width and height controls](https://doona.daeuniverse.org/screenshots/en/dashboard-settings.webp)

Adjust card sizes on the Activity dashboard.

![The Flows map showing the traffic path through a selected rule or node](https://doona.daeuniverse.org/screenshots/en/routing.webp)

The Flows map; selecting a rule or node shows the traffic path through it.

### Nodes and subscriptions

- Paste several node links at once.
- Test filtered nodes and sort by latency.
- Refresh subscriptions and inspect probe results.

![Node actions menu and probe results](https://doona.daeuniverse.org/screenshots/en/node-actions.webp)

Inspect a node’s probe results and add it to a group.

### Groups and routing

- Edit groups, membership filters and selection policies.
- Edit the rule list and apply routing templates.
- Trace routing decisions with a process name and firewall mark.

![Policy group editor](https://doona.daeuniverse.org/screenshots/en/group-editor.webp)

Edit a group’s filters and policy.

![Rule list in advanced view](https://doona.daeuniverse.org/screenshots/en/rules-advanced.webp)

Inspect the rule list in advanced view.

### Configuration

- Edit source files with validation diagnostics.
- Change global settings through a form.
- Inspect revisions and export configuration.

![Configuration editor with validation errors](https://doona.daeuniverse.org/screenshots/en/config-diagnostics.webp)

Locate validation errors in the source editor.

### Appearance and phones

- Choose palettes and light or dark themes.
- Use English, Simplified Chinese or Traditional Chinese.
- Use page tabs, lists and menus on phones.

![Palette comparison sheet](https://doona.daeuniverse.org/screenshots/palettes.webp)

Compare the available palettes.

![Phone layouts with connections and appearance menus](https://doona.daeuniverse.org/screenshots/en/phone.webp)

Browse connections and change appearance on a phone.

Available features depend on the backend’s capabilities and configuration; see the [feature requirements](https://doona.daeuniverse.org/en/feature-requirements.html).

## Two editions

doona lite is a preview in testing in 0.1.0-rc.3; its pages and behaviour may change. Both editions connect to the same honk with the same administrator credentials.

| Area               | Standard edition                                          | doona lite (preview)                               |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| Traffic monitoring | Activity, connections, flows, DNS, logs and events        | no monitoring pages                                |
| Configuration      | source editor, diagnostics, global settings and revisions | forms for nodes, subscriptions and global settings |
| Groups and rules   | editors, templates and route trace                        | group, routing and DNS editors                     |
| Intended use       | full interface for everyday management                    | smaller configuration editor                       |
| Status             | release candidate                                         | preview in testing                                 |

See the [edition comparison](https://doona.daeuniverse.org/en/editions.html) for features, backend requirements and switching editions.

![The doona lite Nodes page](https://doona.daeuniverse.org/images/lite-nodes-light.webp)

## Try the demo

Try the UI with sample data; no backend is needed.

[Standard edition](https://demo.daeuniverse.org/)

[doona lite (preview)](https://demo.daeuniverse.org/lite/)

To see error states, use [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults); `?scenario=` returns to the healthy demo.

## Install

Start with a honk build that provides the native API; the [installation guide](https://doona.daeuniverse.org/en/install.html#install) lists compatible builds and setup steps. Then download `doona-<version>.tar.gz` from the [releases page](https://github.com/Zakkaus/doona/releases).
Extract it into the directory that honk's `native_api` block names in `ui`; honk serves doona at `/ui/`.
The same release provides `doona-lite-<version>.tar.gz`; extract it to its own directory, `/usr/share/doona-lite`, and use `ui` to select the edition as described in the [lite guide](https://doona.daeuniverse.org/en/lite.html).
Editing settings and configuration requires write permission on the backend. See [package details](docs/install.md) for archive contents.

## Backend protocols

honk handles proxying, so protocol support depends on the backend version and build. Its proxy protocols include SOCKS5, Shadowsocks/2022, Trojan, VMess, VLESS, AnyTLS, Hysteria2, TUIC and Juicity; see the [honk node reference](https://github.com/daeuniverse/honk/blob/main/doc/en/reference/nodes.md#protocols) for supported options and limits.

WebSocket, gRPC and XHTTP are stream transports, separate from proxy protocols. On honk versions with XHTTP support, Trojan/VMess/VLESS use the [H2 XHTTP profile](https://github.com/daeuniverse/honk/blob/main/doc/en/reference/nodes.md#xhttp-over-h2), with no H1/H3 fallback; the reference lists supported combinations and limitations.

## Latest release

[0.1.0-rc.3](CHANGELOG.md) has 52 entries: 5 additions, 7 changes, 34 fixes and 6 internal updates.

It adds a preview of doona lite, a smaller configuration editor shipped in its own archive. The Nodes page takes several node links at once and tests the filtered list, sorted by latency, and the route trace accepts a firewall mark. A first run opens a connection form in Settings, and up to four recently left pages reopen as they were. Suspending the service, clearing logs, switching to Direct or Global mode and leaving an unapplied rule template or group draft now ask for confirmation.

## Documentation

- [Installation and packages](docs/install.md): [简体中文](docs/install.zh-CN.md) / [繁體中文](docs/install.zh-TW.md)
- [Pages, page tour and phone layout](docs/pages.md): [简体中文](docs/pages.zh-CN.md) / [繁體中文](docs/pages.zh-TW.md)
- [Themes and palettes](docs/themes.md): [简体中文](docs/themes.zh-CN.md) / [繁體中文](docs/themes.zh-TW.md)
- [Fonts](docs/fonts.md)
- [Country flags](docs/country-flags.md)
- [Changelog](CHANGELOG.md)
- [Documentation site](https://doona.daeuniverse.org/en/)

## Development

The build, test and packaging commands, the source layout and the contract pin are on the [development page](https://doona.daeuniverse.org/en/development.html). See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

For lite’s separate dependency install and build commands, see [Development](https://doona.daeuniverse.org/en/development.html#doona-lite).

## Support

Report bugs and ask questions in the [issues](https://github.com/Zakkaus/doona/issues). Report backend issues to the connected engine's project: [honk](https://github.com/daeuniverse/honk) or [dae](https://github.com/daeuniverse/dae). See [SECURITY.md](.github/SECURITY.md) for reporting a vulnerability.

## License and credits

[GPL-3.0-only](LICENSE). [Noto Sans TC and SC](docs/fonts.md), bundled from Fontsource npm packages, are copyright Adobe and licensed under the [Open Font License](LICENSES/OFL-1.1.txt); [NOTICE](NOTICE) credits the Adobe Spectrum icons (Apache-2.0).
