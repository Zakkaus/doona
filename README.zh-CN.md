<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的静态 Web 界面：在浏览器中管理节点、群组、规则与配置。**

**[在线演示](https://demo.daeuniverse.org/)** / **[文档](https://zakkaus.github.io/doona-docs/zh-CN/)**

[English](README.md) / 简体中文 / [繁體中文](README.zh-TW.md)

[两个版本](#两个版本) / [体验演示版](#体验演示版) / [安装](#安装) / [后端协议](#后端协议) / [文档](#文档)

</div>

doona 是用于管理代理后端的静态 Web 界面。查看真实数据需要兼容且正在运行的后端，并启用原生 API；目前支持 [honk](https://github.com/daeuniverse/honk)。目前不支持 dae；兼容性取决于 dae 未来是否实现同一份 API 契约。honk 或其他 Web 服务器均可提供此界面。

根据后端开放的功能，doona 可以：

- 监控流量、连接、事件与日志。
- 管理节点与订阅、刷新订阅、查看探测结果。
- 管理群组、成员与节点选择。
- 查看路由与 DNS 规则，编辑可写源文件中的规则。
- 编辑配置源文件、校验变更、导出源文件。

## 两个版本

标准版用于监控流量并管理全部配置。doona lite 用于编辑节点、订阅、策略组、路由、DNS 与全局设置，不含流量页面。两者连接同一个 honk，使用相同的管理员凭据。

功能、后端要求及版本切换方式见[版本比较](https://zakkaus.github.io/doona-docs/zh-CN/editions.html)。

<img src="https://zakkaus.github.io/doona-docs/images/lite-nodes-light.webp" width="100%" alt="doona lite 节点页面">

## 体验演示版

[打开演示版](https://demo.daeuniverse.org/)即可使用示例数据体验界面，无需后端。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 打开可查看错误状态，以 `?scenario=` 打开则恢复正常的演示版。

也可打开 [lite 演示版](https://demo.daeuniverse.org/lite/)，体验精简的配置编辑器。

## 安装

先按[安装指南](https://zakkaus.github.io/doona-docs/zh-CN/install.html#install)选择并配置支持原生 API 的 honk 版本，再从[发布页](https://github.com/Zakkaus/doona/releases)下载 `doona-<version>.tar.gz`。
解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。
同一次发布还提供 `doona-lite-<version>.tar.gz`；将其解压到独立目录 `/usr/share/doona-lite`，通过 `ui` 选择版本，具体步骤见 [lite 指南](https://zakkaus.github.io/doona-docs/zh-CN/lite.html)。
修改设置与配置需要后端授予写入权限。各压缩包的内容见[安装说明](docs/install.zh-CN.md)。

## 后端协议

honk 负责代理流量，协议支持取决于后端版本与构建。其代理协议包括 SOCKS5、Shadowsocks/2022、Trojan、VMess、VLESS、AnyTLS、Hysteria2、TUIC 与 Juicity；支持的选项与限制见 [honk 节点参考](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#协议)。

WebSocket、gRPC 与 XHTTP 是流传输方式，与代理协议不同。在支持 XHTTP 的 honk 版本中，Trojan／VMess／VLESS 使用 [H2 XHTTP 兼容配置](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#h2-上的-xhttp)，不会回退到 H1/H3；参考文档列出支持的组合与限制。

![活动页](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/activity-light.webp)

![编辑活动页卡片的宽度与高度](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/dashboard-settings.webp)

![编辑策略群组](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/group-editor.webp)

![高级列表中的路由规则](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/rules-advanced.webp)

![编辑配置文件](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/config-source-light.webp)

## 最新版本

[0.1.0-rc.2](CHANGELOG.md) 共 41 项更新：新增 4 项、变更 9 项、修复 23 项、内部调整 5 项。

本版新增 doona lite，这是一个更精简的配置编辑器，以独立压缩包发布。节点页可一次粘贴多个节点链接，并测试筛选后的节点列表、按延迟排序；路由追踪可填写防火墙标记。首次运行时打开设置页的连接表单，最近离开的至多四个页面返回时保持原样。暂停服务、清空日志、切换到直连或全局模式，以及离开尚未应用的规则模板或群组草稿时，均需确认。

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

lite 的独立依赖安装与构建命令见[开发](https://zakkaus.github.io/doona-docs/zh-CN/development.html#doona-lite)一页。

## 支持

问题与提问请到 [issues](https://github.com/Zakkaus/doona/issues)。后端问题请提交到所连接引擎的项目：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。报告安全漏洞的方式见 [SECURITY.md](.github/SECURITY.md)。

## 许可与致谢

[GPL-3.0-only](LICENSE)。[Noto Sans TC 与 SC](docs/fonts.md) 由 Fontsource npm 包提供，版权归 Adobe 所有，采用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 注明 Adobe Spectrum 图标（Apache-2.0）。
