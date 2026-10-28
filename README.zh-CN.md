<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的静态 Web 界面：在浏览器中管理节点、组、规则与配置。**

**[在线演示](https://demo.daeuniverse.org/)** / **[Lite 演示（预览版）](https://demo.daeuniverse.org/lite/)** / **[文档](https://doona.daeuniverse.org/zh-CN/)**

[繁體中文](README.md) / 简体中文 / [English](README.en.md)

[功能](#功能) / [两个版本](#两个版本) / [体验演示版](#体验演示版) / [安装](#安装) / [后端协议](#后端协议) / [文档](#文档)

</div>

doona 是用于监控代理流量、管理节点、组、规则与配置的静态 Web 界面。使用时需要正在运行且已启用原生 API 的 [honk](https://github.com/daeuniverse/honk) 后端；目前不支持 dae。

![显示流量图表与状态卡片的活动页](https://doona.daeuniverse.org/screenshots/zh-CN/activity-light.webp)

## 功能

### 监控

- 编辑活动页的卡片及其尺寸。
- 查看连接、分流记录与 DNS 查询。
- 查看后端日志与事件。

![活动页卡片的宽度与高度设置](https://doona.daeuniverse.org/screenshots/zh-CN/dashboard-settings.webp)

在活动页调整卡片尺寸。

![分流页地图显示经过所选规则或节点的流量路径](https://doona.daeuniverse.org/screenshots/zh-CN/routing.webp)

分流页地图；选择规则或节点可查看经过它的流量路径。

### 节点与订阅

- 一次粘贴多个节点链接。
- 测试筛选后的节点，并按延迟排序。
- 刷新订阅并查看探测结果。

![节点操作菜单与探测结果](https://doona.daeuniverse.org/screenshots/zh-CN/node-actions.webp)

查看节点的探测结果，并将节点加入组。

### 组与路由

- 编辑组、成员筛选条件与选择策略。
- 编辑规则列表并应用路由模板。
- 填写进程名称与防火墙标记，追踪路由决策。

![策略组编辑器](https://doona.daeuniverse.org/screenshots/zh-CN/group-editor.webp)

编辑组的筛选条件与策略。

![高级视图中的规则列表](https://doona.daeuniverse.org/screenshots/zh-CN/rules-advanced.webp)

在高级视图中查看规则列表。

### 配置

- 编辑配置文件，并通过诊断结果定位校验错误。
- 通过表单修改全局设置。
- 查看修订并导出配置。

![显示校验错误的配置文件编辑器](https://doona.daeuniverse.org/screenshots/zh-CN/config-diagnostics.webp)

在配置文件编辑器中定位校验错误。

### 外观与手机

- 选择配色及浅色或深色主题。
- 使用英语、简体中文或繁体中文。
- 在手机上使用页面标签、列表与菜单。

![可用配色对比图](https://doona.daeuniverse.org/screenshots/palettes.webp)

比较可用的配色。

![手机上的连接列表与外观菜单](https://doona.daeuniverse.org/screenshots/zh-CN/phone.webp)

在手机上浏览连接并调整外观。

可用功能取决于后端的能力与配置，详见[功能要求](https://doona.daeuniverse.org/zh-CN/feature-requirements.html)。

## 两个版本

在 0.1.0-rc.3 中，doona lite 是仍在测试的预览版，页面与行为可能继续变动。两者连接同一个 honk，使用相同的管理员凭据。

| 项目     | 标准版                               | doona lite（预览版）     |
| -------- | ------------------------------------ | ------------------------ |
| 流量监控 | 活动、连接、分流、DNS、日志与事件    | 不含监控页面             |
| 配置     | 配置文件编辑器、诊断、全局设置与修订 | 节点、订阅与全局设置表单 |
| 组与规则 | 编辑器、模板与路由追踪               | 组、路由与 DNS 编辑器    |
| 用途     | 用于日常管理的完整界面               | 体积更小的配置编辑器     |
| 状态     | 候选版本                             | 仍在测试的预览版         |

功能、后端要求及版本切换方式见[版本比较](https://doona.daeuniverse.org/zh-CN/editions.html)。

![doona lite 节点页面](https://doona.daeuniverse.org/images/lite-nodes-light.webp)

## 体验演示版

使用示例数据体验界面，无需后端。

[标准版](https://demo.daeuniverse.org/)

[doona lite（预览版）](https://demo.daeuniverse.org/lite/)

以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 打开可查看错误状态，以 `?scenario=` 打开则恢复正常的演示版。

## 安装

honk 的完整发布版本已内嵌 doona。按照[快速入门](https://doona.daeuniverse.org/zh-CN/quick-start.html)即可使用；文档也说明如何单独安装 doona。

## 后端协议

honk 负责代理流量；支持的协议、传输方式与限制见 [honk 节点参考](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#协议)。

## 最新版本

[0.1.0-rc.3](CHANGELOG.md) 共 54 项更新：新增 5 项、变更 7 项、修复 35 项、内部调整 7 项。

本版更新已有的 doona lite 预览版：检测提供界面的 honk，打开登录页面，或在允许匿名访问时直接连接，并调整 lite 的字体与控件，修复窄窗口中的表格与设置标签页。

## 文档

- [安装与软件包](docs/install.zh-CN.md)：[English](docs/install.md) / [繁體中文](docs/install.zh-TW.md)
- [页面、页面导览与手机布局](docs/pages.zh-CN.md)：[English](docs/pages.md) / [繁體中文](docs/pages.zh-TW.md)
- [主题与配色](docs/themes.zh-CN.md)：[English](docs/themes.md) / [繁體中文](docs/themes.zh-TW.md)
- [字体](docs/fonts.md)
- [国旗](docs/country-flags.md)
- [更新日志](CHANGELOG.md)
- [文档站](https://doona.daeuniverse.org/zh-CN/)

## 开发

构建、测试与打包命令、源码布局与契约的固定提交，见[开发](https://doona.daeuniverse.org/zh-CN/development.html)一页；提交 pull request 前先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

lite 的独立依赖安装与构建命令见[开发](https://doona.daeuniverse.org/zh-CN/development.html#构建-doona-lite)一页。

## 支持

界面问题与提问请到 [doona issues](https://github.com/Zakkaus/doona/issues)。代理、分流、DNS 等引擎问题请提交到 [honk issues](https://github.com/daeuniverse/honk/issues)。报告安全漏洞的方式见 [SECURITY.md](.github/SECURITY.md)。

## 许可与致谢

[GPL-3.0-only](LICENSE)。[Noto Sans TC 与 SC](docs/fonts.md) 由 Fontsource npm 包提供，版权归 Adobe 所有，采用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 注明 Adobe Spectrum 图标（Apache-2.0）。
