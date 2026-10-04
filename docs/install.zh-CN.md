# 安装与软件包

[English](install.md) / 简体中文 / [繁體中文](install.zh-TW.md)

## 状态

doona 对接 honk `feat/native-api` 分支实现的原生 API；这套 API 尚未发布。契约的固定提交记录在 [SOURCE.md](../contract/api-standardize/SOURCE.md)。后端缺少较新资源键时，doona 会把这些键视为不可用。未设置后端时，内置模拟后端提供演示数据；README 与这些说明页面的截图全部来自模拟数据。

## 安装

doona 依赖 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。从[发布页](https://github.com/Zakkaus/doona/releases)的同一标签下载程序归档文件与 `SHA256SUMS`。

将 `doona-<version>.tar.gz` 解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。可选归档文件也解压到同一目录。

[文档](https://zakkaus.github.io/doona-docs/zh-CN/)包含系统要求、honk 与 doona 的安装、示例配置、首次登录、逐项检查功能与故障排查。

## 发布文件

每次发布有 38 个文件。大多数用户只需两个：适用于自己系统的程序文件与 `SHA256SUMS`。下列为 v0.1.0-beta.14 的文件名，其他版本遵循相同的[命名方式](../install/README.md#version-spellings)。

### 程序

手动安装或通过系统的软件包管理器安装，选择其中一个。

| 文件                                  | 内容                                        | 适用系统或方式                  |
| ------------------------------------- | ------------------------------------------- | ------------------------------- |
| `doona-0.1.0-beta.14.tar.gz`          | 构建好的 UI、许可证与更新日志，不含安装程序 | 手动安装，由任意 Web 服务器提供 |
| `doona-web_0.1.0-beta.14-1_all.deb`   | Debian 软件包                               | Debian 或 Ubuntu                |
| `doona-0.1.0-beta.14-1.noarch.rpm`    | RPM 软件包                                  | Fedora 或 openSUSE              |
| `doona-0.1.0beta14-1-any.pkg.tar.zst` | pacman 软件包                               | Arch Linux                      |
| `doona_0.1.0-beta.14-1_all.ipk`       | opkg 软件包                                 | OpenWrt 24.10 及更早版本        |
| `doona-0.1.0_beta14-r1.apk`           | apk-tools 3 软件包                          | OpenWrt 25.12                   |
| `doona-0.1.0-beta.14-r0.alpine.apk`   | Alpine 软件包                               | Alpine Linux                    |

Debian 与 Ubuntu 自带一个无关的 `doona` 软件包，因此 deb 名称为 `doona-web`，安装到 `/usr/share/doona-web`；请将 honk 的 `ui` 设为该路径。其他软件包格式保留 `doona` 名称，安装到 `/usr/share/doona`。Alpine 与 OpenWrt 的 apk 文件不能混用。

### 可选附加包

每个附加包都提供与程序相同的格式，名称包含 `fonts` 或 `precompressed`，例如 `doona-fonts-0.1.0-beta.14.tar.gz`、`doona-web-fonts_0.1.0-beta.14-1_all.deb`、`doona-fonts_0.1.0-beta.14-1_all.ipk` 等。安装与程序格式和版本相同的附加包。

| 名称部分        | 添加的内容                                                                         | 何时安装                                                   |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `fonts`         | Noto Sans TC 与 SC，约 8 MB                                                        | 要使用内置中文字体而非系统字体时。详见[字体说明](fonts.md) |
| `precompressed` | 文本资源的 `.br` 与 `.gz` 压缩副本，约 1.6 MB                                      | 服务器与桌面系统；路由器上可选                             |
| `doc`（Alpine） | `doona-doc-0.1.0-beta.14-r0.alpine.apk`：NOTICE 文件，按 Alpine 软件包惯例单独拆分 | 很少需要                                                   |

Precompressed 意为预先压缩。浏览器接受压缩内容时，honk 或 Web 服务器发送 `.br` 或 `.gz` 副本，无需在每次请求时重新压缩，因此服务器无需耗费 CPU 压缩，在较慢的网络上页面加载更快。压缩副本针对至少 1 KiB 的文本资源，以 `brotli -q 11` 与 `gzip -9 -n` 生成，仅保留小于原始文件的副本。手动安装时，将归档文件解压到存放 doona 文件的目录。

### apk 签名密钥

| 文件                   | 内容                           | 使用方式                               |
| ---------------------- | ------------------------------ | -------------------------------------- |
| `doona-alpine.rsa.pub` | 用于验证 Alpine 软件包的公钥   | Alpine：复制到 `/etc/apk/keys/`        |
| `doona-openwrt.pem`    | 用于验证 OpenWrt 索引的公钥    | OpenWrt 25.12：复制到 `/etc/apk/keys/` |
| `doona-openwrt.adb`    | OpenWrt apk 软件包的已签名索引 | OpenWrt 25.12：由 `apk add -X` 读取    |

每次发布都使用新的密钥签名。见 [apk 安装说明](../install/README.md#installing-the-apk-packages)。

### honk

自 v0.1.0-beta.8 起，在 honk 发行含原生 API 的版本之前，每次 doona 发布也附带 honk 构建，用户无需自行编译 honk。这些构建是 honk 原生 API 分支的 debug 预发布版本的原样副本。

| 文件                                      | 内容                                        |
| ----------------------------------------- | ------------------------------------------- |
| `honk-core-debug-<target>[-stock].tar.gz` | 每个目标一个 honk 构建，共八个              |
| `HONK-SOURCE.txt`                         | honk 发布版本与提交，以及每个构建的 SHA-256 |
| `honk-source-<commit>.tar.gz`             | honk 在该提交的源码                         |

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
