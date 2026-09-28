<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的 Web 界面：在浏览器里管理节点、群组、规则与配置。**

**[在线演示](https://demo.daeuniverse.org/)** / **[文档](https://zakkaus.github.io/doona-docs/zh-CN/)**

[English](README.md) / 简体中文 / [繁體中文](README.zh-TW.md)

[安装](#安装) / [页面](#页面) / [页面导览](#页面导览) / [手机布局](#手机布局) / [开发](#开发)

</div>

doona 是 daeuniverse 引擎共用原生 API 的静态 Web 界面：现在是 honk，dae 实现同一份契约后亦可。它由引擎自己或任意 Web 服务器提供，显示引擎当前的状态，并管理节点、群组、路由规则与配置文件。

[使用示例数据体验演示版](https://demo.daeuniverse.org/)。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 打开演示版可查看错误状态，以 `?scenario=` 打开则恢复正常的演示版。

![活动页](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/activity-light.webp)

<details>
<summary><strong>全部配色</strong></summary>

十二套配色各有浅色与深色。Rosé Pine 有两种，Catppuccin 有三种；另外七种是 Nord、Kary Pro Colors、Ant Design、Arco Design、Semi Design、玻璃与中国（打卡版／通宵版）。中国配色将良好与运行中显示为稳中向好，将不可用与降级显示为严峻挑战。可在顶栏或登录页切换配色。

<img src="https://zakkaus.github.io/doona-docs/screenshots/palettes.webp" alt="全部配色的浅色与深色" width="100%">

</details>

## 配色示例

下图展示活动页的五种配色。可在顶栏切换配色和模式。

| 配色       | 浅色                                                                                                | 深色                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Rosé Pine  | ![Rosé Pine 浅色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-rose-pine-light.webp)   | ![Rosé Pine 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-rose-pine-dark.webp)   |
| Catppuccin | ![Catppuccin 浅色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-catppuccin-light.webp) | ![Catppuccin 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-catppuccin-dark.webp) |
| Nord       | ![Nord 浅色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-nord-light.webp)             | ![Nord 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-nord-dark.webp)             |
| Glass      | ![Glass 浅色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-glass-light.webp)           | ![Glass 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-glass-dark.webp)           |
| 中国       | ![中国打卡版](https://zakkaus.github.io/doona-docs/screenshots/en/theme-qiangguo-light.webp)        | ![中国通宵版](https://zakkaus.github.io/doona-docs/screenshots/en/theme-qiangguo-dark.webp)        |

## 状态

doona 对接 honk `feat/native-api` 分支实现的原生 API；这套 API 尚未发布。契约的钉点记录在 [SOURCE.md](contract/api-standardize/SOURCE.md)。后端缺少较新资源键时，doona 会把这些键视为不可用。未设置后端时，内置模拟后端提供演示数据；本文截图全部来自模拟数据。

## 安装

doona 依赖 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。发行文件（`doona-<version>.tar.gz`、可选的 `doona-fonts-<version>.tar.gz`（Noto Sans TC 与 SC）、`SHA256SUMS`）附在[发布页](https://github.com/Zakkaus/doona/releases)的标签上。将 `doona-<version>.tar.gz` 解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。

自 v0.1.0-beta.8 起，在 honk 发行含原生 API 的正式版本之前，每个 doona 发行版也附带预先构建的 `honk-core-debug-<target>[-stock].tar.gz`，用户无需自行编译 honk。beta.9 的归档文件包含 honk `debug.2026.9.28.native-api.4`（提交 `3ff52762`），提供 DNS 规则、运行时降级与地理数据 SHA-256 校验开关。`HONK-SOURCE.txt` 注明构建所用的 honk 提交，`honk-source-<commit>.tar.gz` 为该提交的源码，`SHA256SUMS` 涵盖除自身以外的全部发布附件。[安装 honk](https://zakkaus.github.io/doona-docs/zh-CN/install.html#install) 说明如何按网关选择归档文件。

[文档](https://zakkaus.github.io/doona-docs/zh-CN/)包含系统要求、honk 与 doona 的安装、示例配置、首次登录、逐项检查功能与故障排查。

## 页面

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/policies-light.webp" alt="策略页" width="100%">

| 页面       | 内容                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 活动       | 出站模式、流量与内存、活动连接、节点延迟、出站用量、流量最高的客户端、通知                               |
| 概览       | 引擎与 eBPF 状态、进程 CPU 使用率、流量计数、运行时降级、后端能力与未开启的功能、状态 JSON 导出          |
| 连接       | 实时连接的来源、目的、命中规则、链及其来源、流量与传输速率；修改可写规则的出站；折叠分组，关闭单条或全部 |
| DNS        | 查询与解析结果、缓存、解析记录与统计；配置可写时按记录中的域名新建 DNS 规则；清空缓存                    |
| 策略       | 群组、成员与健康；选择、手动固定、测试、编辑、健康检查网址，以及可修改的容忍差值与空闲超时               |
| 规则       | 路由规则与 DNS 请求及应答规则，可在可写来源中编辑；分流总览、命中数、流程记录与追踪模拟                  |
| 节点       | 订阅与更新间隔、配置内节点、新增与移除、测试、加入群组                                                   |
| 配置       | 新建来源文件并直接编辑、诊断、校验、快速设置、导出                                                       |
| 事件、日志 | 后端事件流；日志流，可筛选、暂停、导出                                                                   |
| 设置       | 后端、运行时设置与操作、地理数据来源与受支持时的 SHA-256 校验、语言、外观、配色与通知位置                |

只有页面需要的资源全部不可用时，页面才会标为不可用。后端列出 DNS 规则时才显示对应标签页；编辑须有可写的来源文件。连接和规则页打开期间会请求流程，无需将流程记录设为常开。

任何页面按 `Ctrl K` 可搜索页面、连接、节点、群组、规则与来源。各页面需要的资源与 doona 自身设置的存放位置，见[功能](https://zakkaus.github.io/doona-docs/zh-CN/features.html#pages)一页。不易理解的状态与术语旁设有帮助按钮，按下即显示说明。

登录为独立页面，页内提供语言和配色菜单与主题切换。窗口宽度不小于 1024 像素时，表单旁的面板显示施工场景，按下后启动 Flappy Duck 小游戏。演示版预填了用户名 `demo` 和密码 `demo`。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/rules-light.webp" alt="规则页" width="100%">

## 页面导览

### 编排群组

在策略页的编排标签页，将右侧列表中的节点或订阅拖动到群组上，即可加入该群组。键盘拖放可完成相同操作；列表下方的加入组菜单可将勾选的各行加入群组。更改会先暂存，打开检查并应用后按应用，才会写入配置。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/arrange.webp" alt="将节点 us-01 拖动到 gaming 群组" width="100%">

### 流量与连接

连接页的流量标签页用散点图展示每条连接的上传量与下载量，并按出站着色；选中数据点即可打开对应的连接。连接标签页按设备或出站对实时连接分组，可按协议和出站筛选，并导出为 CSV。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/connections-traffic.webp" alt="连接页的流量标签页" width="100%">

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/connections-list.webp" alt="按设备分组的实时连接" width="100%">

### DNS

统计标签页显示解析时间的中位数与 P95、缓存命中率、失败率、各上游在延迟刻度上的查询分布，以及查询的结果分类。后端提供 DNS 规则且配置可写时，可从解析记录为其域名新建 DNS 请求规则，预填的后缀条件也匹配子域名。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/dns.webp" alt="DNS 页的统计标签页" width="100%">

### 日志时间分布

日志列表上方的热力图按时间统计各级别的记录数。点击级别的行标题，即可设置列表显示的最低级别。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/logs.webp" alt="日志时间分布热力图" width="100%">

### 分流总览

规则页的分流总览按规则或设备，经出站追踪到节点。将指针移到规则、出站或节点上，或选中其中一项，即可突出显示经过该项的路径。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/routing.webp" alt="在分流总览中依次选中规则与节点" width="100%">

### 节点延迟

节点页的延迟标签页按策略群组或协议分组，显示每个节点的当前延迟；后端提供时，另显示移动平均和近 10 次平均。不可用的节点列在所属群组下方。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/latency.webp" alt="节点页的延迟标签页" width="100%">

## 手机布局

窗口宽度小于 1024 像素时，侧边导航改为底部栏，分为活动、流量、路由和设置四组。每组打开时显示本次会话中最后浏览的页面，组内各页排成一行，位于内容上方。语言、主题、配色和字标移入顶栏的溢出菜单，各为一个子菜单。

窗口宽度小于 600 像素时，表格保留全部列并可横向滚动；更宽时按预设顺序隐藏放不下的列。工具栏换行排列。在事件与日志页，按下某一行即可在表格下方阅读完整文本。在概览、DNS 和日志页，第一个操作保留为按钮，其余收进菜单。

通过 HTTPS 或在 localhost 上打开时，doona 可安装为应用。在 Chrome 和 Edge 中，设置页的关于卡片提供安装为应用按钮。Safari 没有安装提示，因此卡片改为显示操作步骤：在 iPhone 和 iPad 上轻点共享，再轻点添加到主屏幕；在 macOS 上的 Safari 26 中选取文件 > 添加到程序坞。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/phone.webp" alt="手机上的 doona：连接表格、溢出菜单及其配色子菜单" width="100%">

## 开发

构建、测试与打包命令、源码布局与契约钉点，见[开发](https://zakkaus.github.io/doona-docs/zh-CN/development.html)一页；提交 pull request 前先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 支持

问题与提问请到 [issues](https://github.com/Zakkaus/doona/issues)。后端问题请提交到所连接引擎的项目：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。报告安全漏洞的方式见 [SECURITY.md](.github/SECURITY.md)。

## 许可与致谢

[GPL-3.0-only](LICENSE)。Noto Sans TC 与 SC 版权归 Adobe 所有，采用 [Open Font License](public/fonts/OFL.txt)；[NOTICE](NOTICE) 注明 Adobe Spectrum 图标（Apache-2.0）。鸭子是维护者自己画的。
