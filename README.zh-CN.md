<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的 Web 界面：在浏览器中管理节点、群组、规则与配置。**

**[在线演示](https://demo.daeuniverse.org/)** / **[文档](https://zakkaus.github.io/doona-docs/zh-CN/)**

[English](README.md) / 简体中文 / [繁體中文](README.zh-TW.md)

[安装](#安装) / [页面](#页面) / [页面导览](#页面导览) / [手机布局](#手机布局) / [开发](#开发)

</div>

doona 是 daeuniverse 引擎共用原生 API 的静态 Web 界面。目前支持 honk；dae 实现同一份契约后也可使用。引擎或任意 Web 服务器均可提供此界面。它显示引擎状态，并管理节点、群组、路由规则与配置文件。

[使用示例数据体验演示版](https://demo.daeuniverse.org/)。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 打开演示版可查看错误状态，以 `?scenario=` 打开则恢复正常的演示版。

![活动页](https://zakkaus.github.io/doona-docs/screenshots/zh-CN/activity-light.webp)

<details>
<summary><strong>全部配色</strong></summary>

十二套配色各有浅色与深色。Rosé Pine 有两种，Catppuccin 有三种；另外七种是 Nord、Kary Pro Colors、Ant Design、Arco Design、Semi Design、玻璃与中国（白班／夜班）。中国配色将良好与运行中显示为稳中向好，将不可用与降级显示为严峻挑战。可在顶栏切换配色，或通过登录页的外观按钮打开设置页的外观区域。

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
| 中国       | ![中国白班](https://zakkaus.github.io/doona-docs/screenshots/en/theme-qiangguo-light.webp)          | ![中国夜班](https://zakkaus.github.io/doona-docs/screenshots/en/theme-qiangguo-dark.webp)          |

## 状态

doona 对接 honk `feat/native-api` 分支实现的原生 API；这套 API 尚未发布。契约的固定提交记录在 [SOURCE.md](contract/api-standardize/SOURCE.md)。后端缺少较新资源键时，doona 会把这些键视为不可用。未设置后端时，内置模拟后端提供演示数据；本文截图全部来自模拟数据。

## 安装

doona 依赖 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。发行文件（`doona-<version>.tar.gz`、可选的 `doona-fonts-<version>.tar.gz`（Noto Sans TC 与 SC）、`SHA256SUMS`）附在[发布页](https://github.com/Zakkaus/doona/releases)的标签上。将 `doona-<version>.tar.gz` 解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。

可选的 `doona-precompressed-<version>.tar.gz` 包含文本资源的 `.br` 与 `.gz` 压缩副本；解压到同一目录后，honk 或 Web 服务器即可发送压缩响应。

自 v0.1.0-beta.8 起，在 honk 发行含原生 API 的正式版本之前，每个 doona 发行版也附带预先构建的 `honk-core-debug-<target>[-stock].tar.gz`，用户无需自行编译 honk。归档文件包含 honk 原生 API 分支的 debug 构建，实现最终的原生 API 契约。`HONK-SOURCE.txt` 注明构建所用的 honk 提交，`honk-source-<commit>.tar.gz` 为该提交的源码，`SHA256SUMS` 涵盖除自身以外的全部发布附件。[安装 honk](https://zakkaus.github.io/doona-docs/zh-CN/install.html#install) 说明如何按网关选择归档文件。

[文档](https://zakkaus.github.io/doona-docs/zh-CN/)包含系统要求、honk 与 doona 的安装、示例配置、首次登录、逐项检查功能与故障排查。

## v0.1.0-beta.13 更新

以下为相较 beta.12 的更新；完整记录见 [CHANGELOG](CHANGELOG.md#010-beta13---2026-10-03)。

- 以可视化表单编辑 routing 与 DNS 条件，保留注释，不支持的表达式仍可作为文本编辑。
- 应用分流模板前预览差异，并分别设置广告拦截、QUIC 拦截与 NetworkManager 直连。
- 在同一对话框中创建和编辑策略群组，可搜索成员选项，并在保存前撤销更改。
- 直接编辑节点名称与分享链接，并设置订阅更新间隔、User-Agent、缓存与下载路由。
- 在配置文件编辑器旁查看诊断，在单独的表单中修改持久全局设置；后端支持时，可导出配置、导入服务器启动文件并恢复配置修订版本。
- 为节点与嵌套群组选择延迟探测方法及 IP 协议族，并查看各类探测的最新延迟或失败原因。
- 选择 DNS 查询上游，预览并删除匹配的缓存记录，直接从缓存或解析记录行创建规则。
- 以任一界面语言搜索设置字段、配置章节与添加订阅等功能入口，并直接打开对应的页面、字段或行。
- 按宽度与高度预设或拖动边缘调整仪表盘卡片大小，编辑时显示每行的剩余空间。
- 在浮动、固定或手机抽屉式面板中排列小工具，在小工具编辑器中按实际宽度预览面板，并将未固定且未停靠的面板隐藏在屏幕边缘。
- 在活动页查看群组当前节点的延迟、CPU 与延迟趋势，以及首次设置引导。
- 页面工具栏、标签栏与分段控件采用 S2 默认的 32px 高度；键盘焦点环与内容保持间距，也不再被容器裁切。

Debian 与 Ubuntu 用户请注意：deb 软件包已更名为 `doona-web`，安装到 `/usr/share/doona-web`，因为这两个发行版自带一个无关的 `doona` 软件包；请将 honk 的 `ui` 改为新路径。

## 页面

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/policies-light.webp" alt="策略页" width="100%">

| 页面       | 内容                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| 活动       | 出站模式、流量、内存与进程 CPU 使用率、活动连接、节点延迟、出站用量、流量最高的客户端、通知                          |
| 系统状态   | 引擎与 eBPF 状态、进程 CPU 使用率、流量计数、运行时降级、后端能力与未开启的功能、状态 JSON 导出                      |
| 连接       | 实时连接的来源、目的、命中规则、链及其来源、流量与传输速率；修改可写规则的出站；折叠分组，关闭单条或全部             |
| 分流       | 分流总览与流程记录                                                                                                   |
| DNS        | 查询与解析结果、缓存、解析记录与统计；缓存和解析记录各行提供新建规则操作；选择查询上游；受支持时删除匹配项或清空缓存 |
| 策略       | 群组、成员与健康；选择、手动固定、测试、编辑、健康检查网址，以及可修改的容忍差值与空闲超时                           |
| 规则       | 路由规则与 DNS 请求及应答规则，可在可写来源中编辑；简易视图中的模板设置；命中数与追踪模拟                            |
| 节点       | 订阅与更新间隔、配置内节点、新增与移除、测试、按类型查看探测结果、加入群组                                           |
| 配置       | 新建来源文件并直接编辑、诊断、校验、当前配置版本、来源文件导出                                                       |
| 事件、日志 | 后端事件流；日志流，可筛选、暂停、导出                                                                               |
| 设置       | 后端、运行时设置、地理数据来源与状态、恢复默认值与受支持时的 SHA-256 校验、语言、外观、配色与通知位置                |

只有页面需要的资源全部不可用时，页面才会标为不可用。后端列出 DNS 规则时才显示对应标签页；编辑须有可写的来源文件。连接、分流和规则页打开期间会请求流程，无需将流程记录设为常开。

任何页面按 `Ctrl K` 可搜索页面、连接、节点、群组、规则与来源。各页面需要的资源与 doona 自身设置的存放位置，见[功能](https://zakkaus.github.io/doona-docs/zh-CN/features.html#pages)一页。不易理解的状态与术语旁设有帮助按钮，按下即显示说明。

登录为独立页面，外观按钮会打开设置页的外观区域，可在其中设置语言、配色与主题。窗口宽度不小于 1024 像素时，表单旁的面板显示施工场景，按下后启动 Flappy Duck 小游戏。演示版预填了用户名 `demo` 和密码 `demo`。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/rules-light.webp" alt="规则页" width="100%">

## 页面导览

### 组成员

在策略页按组卡片的铅笔按钮，即可编辑策略及选入的地区、订阅与节点。对话框显示符合条件的节点，保存前可撤销更改。新建组使用同一个编辑器。节点页的组链接会跳转到组卡片；节点操作菜单中，加入组列出可写主文件与包含文件中的组；选择后打开编辑器，暂存选中的节点，待确认后保存。在包含文件中声明的节点与订阅不能从此页移除，禁用的操作会说明原因。

### 流量与连接

连接页的流量标签页用散点图展示每条连接的上传量与下载量，并按出站着色；选中数据点即可打开对应的连接。连接标签页按设备或出站对实时连接分组，可按协议和出站筛选，并导出为 CSV。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/connections-traffic.webp" alt="连接页的流量标签页" width="100%">

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/connections-list.webp" alt="按设备分组的实时连接" width="100%">

### DNS

统计标签页显示解析时间的中位数与 P95、缓存命中率、失败率、各上游在延迟刻度上的查询分布，以及查询的结果分类。缓存和解析记录各行的新建规则图标用于该行域名。后端提供 DNS 规则时，图标打开 DNS 请求规则编辑器；否则打开路由规则编辑器。保存须有可写的配置来源。默认条件精确匹配域名；要包含子域名，须选择后缀条件。

查询标签页的自动选项遵循 `dns.routing`；配置可读时，也可选择 `dns.upstream` 中定义的上游。后端支持删除时，缓存标签页可按全名、后缀、关键词或正则表达式、记录类型，或两者的组合删除记录，确认前会显示匹配数量。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/dns.webp" alt="DNS 页的统计标签页" width="100%">

### 日志时间分布

日志列表上方的热力图按时间统计各级别的记录数。点击级别的行标题，即可设置列表显示的最低级别。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/logs.webp" alt="日志时间分布热力图" width="100%">

### 分流总览

分流页的分流总览按规则或设备，经出站追踪到节点。将指针移到规则、出站或节点上，或选中其中一项，即可突出显示经过该项的路径。规则页追踪模拟的高级字段接受可选的 DSCP 整数，范围为 0 至 63，用于评估 `dscp(...)` 规则。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/routing.webp" alt="在分流总览中依次选中规则与节点" width="100%">

### 节点延迟

节点页的延迟标签页按策略群组或协议分组，显示每个节点的当前延迟；后端提供时，另显示移动平均和近 10 次平均。不可用的节点列在所属群组下方。在节点标签页打开节点行，可查看后端报告的各类探测最新结果，包括 TCP、HTTP、UDP 和 DNS，每项显示延迟或失败原因。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/latency.webp" alt="节点页的延迟标签页" width="100%">

### 配置与设置

配置页显示当前生效的配置版本。模块标签页为每个配置块显示一行摘要，并链接到管理该配置块的页面。后端支持时，全局设置编辑引擎的持久设置；配置文件标签页编辑选中的可写来源，并导出显示的内容，导出文件可能包含凭据。若写入涉及必须重启才能生效的设置，则整次写入被拒绝；提示会列出设置，并提供重启命令和安装指南链接。

<!-- Screenshot publication: add config-source-light.webp and config-global-light.webp after the documentation deployment publishes them. -->

设置页的地理数据卡片列出地理数据文件，并在后端支持时显示状态与更新操作。重置为默认值经确认后移除所有地理数据覆盖及取自配置文件的值，恢复内置来源与默认值。重新加载、DNS 缓存、订阅与连接操作保留在各自页面，不放在设置页。错误通知和操作结果未知的提示提供复制错误；设置页的关于卡片可复制内存中保留的最近 20 条错误，不含密钥与请求正文。

### 小工具

浮动小工具面板的菜单提供编辑小工具，适用的速率与数量小工具可选择迷你折线图或键值列表。未固定且未停靠的面板提供收至边缘；将指针移到速度摘要上、聚焦或点击摘要即可展开。未固定的浮动面板在切换页面时收起。

## 手机布局

窗口宽度小于 1024 像素时，侧边导航改为底部栏，分为活动、流量、路由和设置四组。每组打开时显示本次会话中最后浏览的页面，组内各页排成一行，位于内容上方。语言、主题和配色移入顶栏的溢出菜单，各为一个子菜单。字标在设置页的外观区域选择。

窗口宽度小于 600 像素时，表格保留全部列并可横向滚动；更宽时按预设顺序隐藏放不下的列。工具栏换行排列。在事件与日志页，按下某一行即可在表格下方阅读完整文本。在系统状态、DNS 和日志页，第一个操作保留为按钮，其余收进菜单。

通过 HTTPS 或在 localhost 上打开时，doona 可安装为应用。在 Chrome 和 Edge 中，设置页的关于卡片提供安装为应用按钮。Safari 没有安装提示，因此卡片改为显示操作步骤：在 iPhone 和 iPad 上轻点共享，再轻点添加到主屏幕；在 macOS 上的 Safari 26 中选取文件 > 添加到程序坞。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-CN/phone.webp" alt="手机上的 doona：连接表格、溢出菜单及其配色子菜单" width="100%">

## 开发

构建、测试与打包命令、源码布局与契约的固定提交，见[开发](https://zakkaus.github.io/doona-docs/zh-CN/development.html)一页；提交 pull request 前先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 支持

问题与提问请到 [issues](https://github.com/Zakkaus/doona/issues)。后端问题请提交到所连接引擎的项目：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。报告安全漏洞的方式见 [SECURITY.md](.github/SECURITY.md)。

## 许可与致谢

[GPL-3.0-only](LICENSE)。[Noto Sans TC 与 SC](docs/fonts.md) 由 Fontsource npm 包提供，版权归 Adobe 所有，采用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 注明 Adobe Spectrum 图标（Apache-2.0）。
