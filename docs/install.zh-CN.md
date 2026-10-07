# 安装与软件包

[English](install.md) / 简体中文 / [繁體中文](install.zh-TW.md)

## 状态

doona 对接 honk `feat/native-api` 分支实现的原生 API；这套 API 尚未发布。契约的固定提交记录在 [SOURCE.md](../contract/api-standardize/SOURCE.md)。后端缺少较新资源键时，doona 会把这些键视为不可用。未设置后端时，内置模拟后端提供演示数据；README 与这些说明页面的截图全部来自模拟数据。

## 安装

doona 依赖 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。从[发布页](https://github.com/Zakkaus/doona/releases)的同一标签下载程序归档文件与 `SHA256SUMS`。

将 `doona-<version>.tar.gz` 解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。可选归档文件也解压到同一目录。

### 通过域名访问

通过 `http://owrt.lan:9527/ui/` 访问时，将以下两个值加入现有 `experimental` → `native_api` 配置块的允许列表。这是配置片段，不可用它替换完整配置；保留列表中的其他值，以及现有的 `listen`、`secret`、`password_auth` 和 `ui` 设置。

```dae
experimental {
    native_api {
        allowed_hosts: 'owrt.lan:9527'
        allow_origins: 'http://owrt.lan:9527'
    }
}
```

`allowed_hosts` 允许请求的 `Host`，值为域名和端口，不含协议或路径；它不会自动允许 `Origin`。`allow_origins` 允许 HTTP 来源，值包含协议、域名和端口，不含 `/ui/`、其他路径或末尾的斜杠。填写多个值时，每个值分别加引号，以逗号分隔；不要使用 JSON 方括号，也不要把整个列表放在同一对引号内。

HTML 可以打开，但 JavaScript 或 CSS 请求返回 403 时，在浏览器的网络面板查看这些请求。核对 `Host`、`Origin` 及其端口是否符合上述设置。修改后须重启 honk，仅重新加载配置不足以生效。然后重新加载页面，检查原先失败的请求是否成功。

创建管理员另有限制：honk 检查实际连接来源是否为本机、私有网络或链路本地地址。Host 和 Origin 允许列表不会改变这项限制。

[文档](https://zakkaus.github.io/doona-docs/zh-CN/)包含系统要求、honk 与 doona 的安装、示例配置、首次登录、逐项检查功能与故障排查。

## 发布文件

先发布独立 UI 文件，再附加内嵌同版本 UI 的 honk 构建及对应源码。大多数用户只需两个：适用于自己系统的程序文件与 `SHA256SUMS`。下列为 v0.1.0-beta.18 的文件名，其他版本遵循相同的[命名方式](../install/README.md#version-spellings)。

### 程序

手动安装或通过系统的软件包管理器安装，选择其中一个。

| 文件                                  | 内容                               | 适用系统或方式                  |
| ------------------------------------- | ---------------------------------- | ------------------------------- |
| `doona-0.1.0-beta.18.tar.gz`          | 构建好的 UI 与许可证，不含安装程序 | 手动安装，由任意 Web 服务器提供 |
| `doona-web_0.1.0-beta.18-1_all.deb`   | Debian 软件包                      | Debian 或 Ubuntu                |
| `doona-0.1.0-beta.18-1.noarch.rpm`    | RPM 软件包                         | Fedora 或 openSUSE              |
| `doona-0.1.0beta18-1-any.pkg.tar.zst` | pacman 软件包                      | Arch Linux                      |
| `doona_0.1.0-beta.18-1_all.ipk`       | opkg 软件包                        | OpenWrt 24.10 及更早版本        |
| `doona-0.1.0_beta18-r1.apk`           | apk-tools 3 软件包                 | OpenWrt 25.12                   |
| `doona-0.1.0-beta.18-r0.alpine.apk`   | Alpine 软件包                      | Alpine Linux                    |

Debian 与 Ubuntu 自带一个无关的 `doona` 软件包，因此 deb 名称为 `doona-web`，安装到 `/usr/share/doona-web`；请将 honk 的 `ui` 设为该路径。其他软件包格式保留 `doona` 名称，安装到 `/usr/share/doona`。Alpine 与 OpenWrt 的 apk 文件不能混用。

### 可选附加包

每个附加包都提供与程序相同的格式，名称包含 `fonts` 或 `precompressed`，例如 `doona-fonts-0.1.0-beta.18.tar.gz`、`doona-web-fonts_0.1.0-beta.18-1_all.deb`、`doona-fonts_0.1.0-beta.18-1_all.ipk` 等。安装与程序格式和版本相同的附加包。

| 名称部分        | 添加的内容                                                                         | 何时安装                                                   |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `fonts`         | Noto Sans TC 与 SC，约 8 MB                                                        | 要使用内置中文字体而非系统字体时。详见[字体说明](fonts.md) |
| `precompressed` | 文本资源的 `.br` 与 `.gz` 压缩副本，约 1.6 MB                                      | 服务器与桌面系统；路由器上可选                             |
| `doc`（Alpine） | `doona-doc-0.1.0-beta.18-r0.alpine.apk`：NOTICE 文件，按 Alpine 软件包惯例单独拆分 | 很少需要                                                   |

Precompressed 意为预先压缩。浏览器接受压缩内容时，honk 或 Web 服务器发送 `.br` 或 `.gz` 副本，无需在每次请求时重新压缩，因此服务器无需耗费 CPU 压缩，在较慢的网络上页面加载更快。压缩副本针对至少 1 KiB 的文本资源，以 `brotli -q 11` 与 `gzip -9 -n` 生成，仅保留小于原始文件的副本。手动安装时，将归档文件解压到存放 doona 文件的目录。

### apk 签名密钥

| 文件                   | 内容                           | 使用方式                               |
| ---------------------- | ------------------------------ | -------------------------------------- |
| `doona-alpine.rsa.pub` | 用于验证 Alpine 软件包的公钥   | Alpine：复制到 `/etc/apk/keys/`        |
| `doona-openwrt.pem`    | 用于验证 OpenWrt 索引的公钥    | OpenWrt 25.12：复制到 `/etc/apk/keys/` |
| `doona-openwrt.adb`    | OpenWrt apk 软件包的已签名索引 | OpenWrt 25.12：由 `apk add -X` 读取    |

每次发布都使用新的密钥签名。见 [apk 安装说明](../install/README.md#installing-the-apk-packages)。

### honk

先发布独立 UI，使 honk 能内嵌该版本。内嵌同版本 UI 的 honk debug 预发布版本构建并验证完成后，将其八个原样构建、`HONK-SOURCE.txt` 和两份对应源码归档附加到同一 doona 发布版本。附件状态见发布说明。

附带的 honk 构建内嵌与发布版本相同的 doona；`ui: embedded` 提供该版本。若要使用独立归档文件或软件包，请将 `native_api` 中的 `ui` 设为安装目录并重启 honk：大多数软件包为 `/usr/share/doona`，Debian 为 `/usr/share/doona-web`，手动安装则为归档文件解压后的目录。`HONK-SOURCE.txt` 记录 honk 发布版本与提交、内嵌 doona 的版本、修订与程序 SHA-256，以及两份源码。

| 文件                                      | 内容                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| `honk-core-debug-<target>[-stock].tar.gz` | 每个目标一个 honk 构建，共八个                         |
| `HONK-SOURCE.txt`                         | honk 与内嵌 doona 的来源记录，以及构建和源码的 SHA-256 |
| `honk-source-<commit>.tar.gz`             | 记录的 honk 提交所对应的源码                           |
| `doona-source-0.1.0-beta.18.tar.gz`       | 记录的 doona 修订所对应的内嵌 UI 源码                  |

| 文件名部分            | 选择依据                               |
| --------------------- | -------------------------------------- |
| `x86_64` 或 `aarch64` | 网关的 CPU，与 `uname -m` 输出一致     |
| `unknown-linux-musl`  | 网关用静态二进制文件；不确定时选此格式 |
| `unknown-linux-gnu`   | 基于 glibc 的发行版                    |
| 无后缀                | 默认分配器 mimalloc                    |
| `-stock`              | 使用系统分配器代替 mimalloc            |

[安装 honk](https://zakkaus.github.io/doona-docs/zh-CN/install.html#install) 说明如何按网关选择、验证和安装构建。

### 校验和与源码

| 文件                                    | 内容                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SHA256SUMS`                            | 除自身以外的每个发布文件的 SHA-256；使用 `sha256sum -c --ignore-missing SHA256SUMS` 检查下载的文件 |
| Source code (zip), Source code (tar.gz) | doona 在发布标签处的源码，由 GitHub 添加                                                           |

## 打包维护

软件包版本、打包配置、签名、本地构建与安装命令见 [install/README.md](../install/README.md)。
