<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的 Web 界面：在浏览器中管理节点、群组、规则与配置。**

**[在线演示](https://demo.daeuniverse.org/)** / **[文档](https://zakkaus.github.io/doona-docs/zh-CN/)**

[English](README.md) / 简体中文 / [繁體中文](README.zh-TW.md)

[安装](#安装) / [文档](#文档) / [开发](#开发)

</div>

doona 是 daeuniverse 引擎共用原生 API 的静态 Web 界面，显示引擎状态，并管理节点、群组、路由规则与配置文件。目前支持 honk；dae 实现同一份契约后也可使用。引擎或任意 Web 服务器均可提供此界面。

[使用示例数据体验演示版](https://demo.daeuniverse.org/)。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 打开演示版可查看错误状态，以 `?scenario=` 打开则恢复正常的演示版。

![活动页](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/activity-light.webp)

## 安装

从[发布页](https://github.com/Zakkaus/doona/releases)下载 `doona-<version>.tar.gz`。
解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。
安装步骤与软件包选择见[安装说明](docs/install.zh-CN.md)和[文档站的安装指南](https://zakkaus.github.io/doona-docs/zh-CN/install.html#install)。

## 文档

- [安装与软件包](docs/install.zh-CN.md)：[English](docs/install.md) / [繁體中文](docs/install.zh-TW.md)
- [页面、页面导览与手机布局](docs/pages.zh-CN.md)：[English](docs/pages.md) / [繁體中文](docs/pages.zh-TW.md)
- [主题与配色](docs/themes.zh-CN.md)：[English](docs/themes.md) / [繁體中文](docs/themes.zh-TW.md)
- [字体](docs/fonts.md)
- [国旗](docs/country-flags.md)
- [更新日志](CHANGELOG.md)
- [文档站](https://zakkaus.github.io/doona-docs/zh-CN/)

## 开发

构建、测试与打包命令、源码布局与契约的固定提交，见[开发](https://zakkaus.github.io/doona-docs/zh-CN/development.html)一页；提交 pull request 前先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 支持

问题与提问请到 [issues](https://github.com/Zakkaus/doona/issues)。后端问题请提交到所连接引擎的项目：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。报告安全漏洞的方式见 [SECURITY.md](.github/SECURITY.md)。

## 许可与致谢

[GPL-3.0-only](LICENSE)。[Noto Sans TC 与 SC](docs/fonts.md) 由 Fontsource npm 包提供，版权归 Adobe 所有，采用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 注明 Adobe Spectrum 图标（Apache-2.0）。
