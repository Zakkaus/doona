# 页面与导航

[English](pages.md) / 简体中文 / [繁體中文](pages.zh-TW.md)

标准版将页面分为四个导航分区。页面操作与手机导航见[界面导览](https://doona.daeuniverse.org/zh-CN/tour.html)，各项控件的使用方法见[观测指南](https://doona.daeuniverse.org/zh-CN/observe.html)、[路由指南](https://doona.daeuniverse.org/zh-CN/routing.html)与[配置指南](https://doona.daeuniverse.org/zh-CN/config-and-settings.html)。

## 源码索引

| 源码                                                                  | 职责                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| [src/shell/routes.ts](../src/shell/routes.ts)                         | 路由标识、默认路由、导航分区与 `PageProps`             |
| [src/shell/registry.ts](../src/shell/registry.ts)                     | 页面加载器、导航标签、图标、快捷键、加载占位与资源要求 |
| [src/features/](../src/features/)                                     | 功能页面及其状态钩子                                   |
| [src/shell/widgets/Dashboard.tsx](../src/shell/widgets/Dashboard.tsx) | 活动页                                                 |
| [src/shell/SideNav.tsx](../src/shell/SideNav.tsx)                     | 导航呈现                                               |
| [src/shell/search/](../src/shell/search/)                             | 全局搜索                                               |
| [src/i18n/locales/](../src/i18n/locales/)                             | 注册表引用的翻译标签                                   |

## 导航分区

下表标签与简体中文语言目录一致。各语言使用相同的路由与分区 ID，顺序由 [routes.ts](../src/shell/routes.ts) 定义。

| 标签 | 分区 ID    | 路由 ID                                         |
| ---- | ---------- | ----------------------------------------------- |
| 活动 | `activity` | `activity`, `overview`                          |
| 观测 | `traffic`  | `connections`, `flows`, `dns`, `logs`, `events` |
| 路由 | `routing`  | `policies`, `nodes`, `rules`                    |
| 设置 | `settings` | `config`, `settings`                            |

## 操作补充

以下内容补充链接指南中尚未说明的控件与限制。

### 登录与节点详情

演示版预先填入用户名 `demo` 与密码 `demo`。

节点详情中的组链接会打开策略页对应的组卡片。后端报告多种探测结果时，展开节点行可查看最新的 TCP、HTTP、UDP 或 DNS 结果，包括各项延迟或失败原因。逐节点国旗操作见[更换节点国旗](country-flags.md#change-a-nodes-flag)。

### XHTTP 节点选项

在粘贴节点链接或编辑…中输入支持的 VLESS 或 Trojan XHTTP 链接后，XHTTP 选项会显示模式、路径、主机、标头、填充、POST 节奏与独立下载端等字段。保存的值仍是链接，字段修改会写入对应查询参数或 `extra` JSON 成员。无法用这些字段表示的链接仍可直接编辑原始文本。

未修改的查询参数字符串会保留。修改 `extra` 会重新序列化对象、规范化空白，并使用 JavaScript 的数字精度。标头名称会去除首尾空白；重复名称不区分大小写，必须更正后才能保存。未完成的标头行也算未保存更改；替换原始链接会替换这些行。

链接有变更且后端提供语法验证时，doona 会在写入前要求 honk 单独解析该链接。链接被拒绝时，会显示翻译后的诊断及后端提供的详细信息。8,192 字符限制只适用于新增节点；更长的现有声明可在此处或配置页编辑。

链接验证与保存共用一个事务，因此组与路由模式的编辑必须等待该事务完成，即使节点对话框已经关闭。字段映射见 [xhttp.ts](../src/dae/xhttp.ts)，保存流程见 [useNodesPage.ts](../src/features/nodes/useNodesPage.ts)。

### 观测图表与列表

- 连接页的流量标签页按出站着色，绘制各连接的上传量与下载量。列表标签页可按设备或出站分组、按协议与出站筛选，并展开或折叠各组。
- DNS 的统计标签页显示解析时间中位数、P95、缓存命中率与失败率。图表将各上游的查询放在延迟刻度上，并统计查询结果。
- 日志列表上方的热图按时间统计各级别的记录数。选择级别的行标题可设置列表显示的最低级别。选择日志行可在表格下方阅读完整文本。
- 路由图展示流量从规则或设备经出站到节点的路径。指向或选择规则、出站或节点可突出显示其路径。

### 小工具与手机布局

在编辑小工具中，支持这些显示方式的速率与计数小工具可选择迷你折线图或键值列表。将指针悬停于速度摘要、使其获得焦点或轻点摘要，即可展开隐藏在屏幕边缘的面板。

宽度小于 600 px 时，表格保留所有列并支持横向滚动。更宽的布局会按优先顺序隐藏放不下的列。工具栏会换行。

### 安装为应用

要让浏览器提供 PWA 安装，请通过 HTTPS、`localhost` 或 `127.0.0.1` 访问 doona；详见[安装条件](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable#https_localhost_or_loopback_are_required)。安装可用时，Chrome 与 Edge 会在设置 > 关于中提供安装为应用。

iPhone 与 iPad Safari 中，轻点共享，再轻点添加到主屏幕。macOS Sonoma 或更高版本中，在 Safari 选择文件 > 添加到程序坞。doona 仅在 Safari 26 或更高版本显示这项 macOS 提示，判断逻辑见 [install.ts](../src/shell/install.ts)。

## 修改页面

1. 新增页面时，在 `routePaths` 中加入路由，将其分配到导航分区，并在 `registry.ts` 中加入定义。注册表的类型要求涵盖每个 `RoutePath`。
2. 导航文本放在语言目录中。页面加载器、加载占位与所需资源在注册表中定义。
3. 导航可用性规则由 `navAvailable` 处理。有资源要求的页面，只要至少一项所需资源未被明确标为不可用，即视为可用。配置页还检查导出、导入与修订版本功能。
4. 行为变更时更新对应的使用指南。用户操作步骤放在文档站，本页保留源码索引。操作补充须等指南承接内容且本页提供对应链接后才能删除。

[registry.test.ts](../src/shell/registry.test.ts) 与 [navGroups.test.ts](../src/shell/navGroups.test.ts) 覆盖注册表与导航分区折叠状态的保存。仓库检查要求见 [CONTRIBUTING.md](../CONTRIBUTING.md)。本页的源码索引适用于标准版；lite 应用的源码独立放在 [apps/lite/](../apps/lite/)。
