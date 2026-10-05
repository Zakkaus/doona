<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**Web UI for the [daeuniverse](https://github.com/daeuniverse) engines: manage nodes, groups, rules and configuration in a browser.**

**[Live demo](https://demo.daeuniverse.org/)** / **[Documentation](https://zakkaus.github.io/doona-docs/en/)**

English / [简体中文](README.zh-CN.md) / [繁體中文](README.zh-TW.md)

[Install](#install) / [Documentation](#documentation) / [Development](#development)

</div>

doona is a static web UI for the native API shared by daeuniverse engines. It shows engine state and manages nodes, groups, routing rules and configuration files. It supports honk; dae can use it once it implements the same contract. The engine or any web server can serve it.

[Try the demo with sample data](https://demo.daeuniverse.org/). To see the error states, open it with [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults); `?scenario=` returns to the healthy demo.

![The activity page](https://zakkaus.github.io/doona-docs/screenshots/en/activity-light.webp)

The [beta.15 changelog](CHANGELOG.md) lists 6 additions, 23 changes and 21 fixes, including four Glass palettes, Appearance settings and bounded memory use for live event tables.

![Configuration files with the editable source view](https://zakkaus.github.io/doona-docs/screenshots/en/config-source-light.webp)

## Install

Download `doona-<version>.tar.gz` from the [releases page](https://github.com/Zakkaus/doona/releases).
Extract it into the directory that honk's `native_api` block names in `ui`; honk serves doona at `/ui/`.
See [installation details and package choices](docs/install.md) and the [installation guide](https://zakkaus.github.io/doona-docs/en/install.html#install).

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

## Support

Report bugs and ask questions in the [issues](https://github.com/Zakkaus/doona/issues). Report backend issues to the connected engine's project: [honk](https://github.com/daeuniverse/honk) or [dae](https://github.com/daeuniverse/dae). See [SECURITY.md](.github/SECURITY.md) for reporting a vulnerability.

## License and credits

[GPL-3.0-only](LICENSE). [Noto Sans TC and SC](docs/fonts.md), bundled from Fontsource npm packages, are copyright Adobe and licensed under the [Open Font License](LICENSES/OFL-1.1.txt); [NOTICE](NOTICE) credits the Adobe Spectrum icons (Apache-2.0).
