<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**Static web UI for the [daeuniverse](https://github.com/daeuniverse) engines: manage nodes, groups, rules and configuration in a browser.**

**[Live demo](https://demo.daeuniverse.org/)** / **[Lite demo (preview)](https://demo.daeuniverse.org/lite/)** / **[Documentation](https://daeuniverse.org/doona/)**

[繁體中文](README.md) / [简体中文](README.zh-CN.md) / English

[Features](#features) / [Two editions](#two-editions) / [Try the demo](#try-the-demo) / [Install](#install) / [Backend protocols](#backend-protocols) / [Documentation](#documentation)

</div>

doona is a static web UI for monitoring proxy traffic and managing nodes, groups, rules and configuration. It requires a running [honk](https://github.com/daeuniverse/honk) backend with the native API enabled; dae is not supported yet.

![Activity dashboard with traffic charts and status cards](https://daeuniverse.org/doona/screenshots/en/activity-light.webp)

## Features

### Monitor

- Edit the Activity dashboard’s cards and their sizes.
- Inspect connections, flow records and DNS queries.
- Read backend logs and events.

![Activity card width and height controls](https://daeuniverse.org/doona/screenshots/en/dashboard-settings.webp)

Adjust card sizes on the Activity dashboard.

![The Flows map showing the traffic path through a selected rule or node](https://daeuniverse.org/doona/screenshots/en/routing.webp)

The Flows map; selecting a rule or node shows the traffic path through it.

### Nodes and subscriptions

- Paste several node links at once.
- Test filtered nodes and sort by latency.
- Refresh subscriptions and inspect probe results.

![Node actions menu and probe results](https://daeuniverse.org/doona/screenshots/en/node-actions.webp)

Inspect a node’s probe results and add it to a group.

### Groups and routing

- Edit groups, membership filters and selection policies.
- Edit the rule list and apply routing templates.
- Trace routing decisions with a process name and firewall mark.

![Policy group editor](https://daeuniverse.org/doona/screenshots/en/group-editor.webp)

Edit a group’s filters and policy.

![Rule list in advanced view](https://daeuniverse.org/doona/screenshots/en/rules-advanced.webp)

Inspect the rule list in advanced view.

### Configuration

- Edit source files with validation diagnostics.
- Change global settings through a form.
- Inspect revisions and export configuration.

![Configuration editor with validation errors](https://daeuniverse.org/doona/screenshots/en/config-diagnostics.webp)

Locate validation errors in the source editor.

### Appearance and phones

- Choose palettes and light or dark themes.
- Use English, Simplified Chinese or Traditional Chinese.
- Use page tabs, lists and menus on phones.

![Palette comparison sheet](https://daeuniverse.org/doona/screenshots/palettes.webp)

Compare the available palettes.

![Phone layouts with connections and appearance menus](https://daeuniverse.org/doona/screenshots/en/phone.webp)

Browse connections and change appearance on a phone.

Available features depend on the backend’s capabilities and configuration; see the [feature requirements](https://daeuniverse.org/doona/feature-requirements).

## Two editions

doona lite is a preview in testing in 0.1.0-rc.5; its pages and behaviour may change. Both editions connect to the same honk with the same administrator credentials.

| Area               | Standard edition                                          | doona lite (preview)                               |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| Traffic monitoring | Activity, connections, flows, DNS, logs and events        | no monitoring pages                                |
| Configuration      | source editor, diagnostics, global settings and revisions | forms for nodes, subscriptions and global settings |
| Groups and rules   | editors, templates and route trace                        | group, routing and DNS editors                     |
| Intended use       | full interface for everyday management                    | smaller configuration editor                       |
| Status             | release candidate                                         | preview in testing                                 |

See the [edition comparison](https://daeuniverse.org/doona/editions) for features, backend requirements and switching editions.

![The doona lite Nodes page](https://daeuniverse.org/doona/images/lite-nodes-light.webp)

## Try the demo

Try the UI with sample data; no backend is needed.

[Standard edition](https://demo.daeuniverse.org/)

[doona lite (preview)](https://demo.daeuniverse.org/lite/)

To see error states, use [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults); `?scenario=` returns to the healthy demo.

## Install

honk's full releases already embed doona. Follow the [quick start](https://daeuniverse.org/doona/quick-start) to use it; the documentation also covers installing doona separately. On Debian, Ubuntu, Fedora and openSUSE, install it from the daeuniverse package repository: `doona-web` on Debian and Ubuntu, `doona` on Fedora and openSUSE, with the repository set up as described for [Debian](https://daeuniverse.org/guide/packages/debian), [Fedora](https://daeuniverse.org/guide/packages/fedora) and [openSUSE](https://daeuniverse.org/guide/packages/opensuse). The release archives and packages stay available from the GitHub releases.

## Backend protocols

honk handles proxying; see the [honk node reference](https://github.com/daeuniverse/honk/blob/main/doc/en/reference/nodes.md#protocols) for supported protocols, transports and limits.

## Latest release

[0.1.0-rc.5](CHANGELOG.md) has 33 entries: 10 additions, 5 changes, 15 fixes and 3 internal updates.

This release adds a Manual tab to the Add node dialog, and new nodes can join groups in the same step. Manual policy groups fold, group members name their subscription, and help links open the manual on daeuniverse.org. Dark Reader no longer recolours doona, links into a setting or card scroll to their target, and page skeletons match the loaded pages.

## Documentation

- [Installation and packages](docs/install.md): [简体中文](docs/install.zh-CN.md) / [繁體中文](docs/install.zh-TW.md)
- [Pages, page tour and phone layout](docs/pages.md): [简体中文](docs/pages.zh-CN.md) / [繁體中文](docs/pages.zh-TW.md)
- [Themes and palettes](docs/themes.md): [简体中文](docs/themes.zh-CN.md) / [繁體中文](docs/themes.zh-TW.md)
- [Fonts](docs/fonts.md)
- [Country flags](docs/country-flags.md)
- [Changelog](CHANGELOG.md)
- [Documentation site](https://daeuniverse.org/doona/)

## Development

The build, test and packaging commands, the source layout and the contract pin are on the [development page](https://daeuniverse.org/doona/development). See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

For lite’s separate dependency install and build commands, see [Development](https://daeuniverse.org/doona/development#doona-lite).

## Support

Report interface problems and ask questions in [doona issues](https://github.com/Zakkaus/doona/issues). Report proxy, routing, DNS and other engine problems in [honk issues](https://github.com/daeuniverse/honk/issues). See [SECURITY.md](.github/SECURITY.md) for reporting a vulnerability.

## License and credits

[GPL-3.0-only](LICENSE). [Noto Sans TC and SC](docs/fonts.md), bundled from Fontsource npm packages, are copyright Adobe and licensed under the [Open Font License](LICENSES/OFL-1.1.txt); [NOTICE](NOTICE) credits the Adobe Spectrum icons (Apache-2.0).
