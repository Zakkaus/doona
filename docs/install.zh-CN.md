# 安装与软件包

[English](install.md) / 简体中文 / [繁體中文](install.zh-TW.md)

## 状态

doona 对接 honk `feat/native-api` 分支实现的原生 API；这套 API 尚未发布。契约的固定提交记录在 [SOURCE.md](../contract/api-standardize/SOURCE.md)。后端缺少较新资源键时，doona 会把这些键视为不可用。未设置后端时，内置模拟后端提供演示数据；README 与这些说明页面的截图全部来自模拟数据。

## 安装

doona 依赖 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。从[发布页](https://github.com/Zakkaus/doona/releases)的同一标签下载程序归档文件与 `SHA256SUMS`。

将 `doona-<version>.tar.gz` 解压到 honk `native_api` 配置块中 `ui` 指定的目录，honk 即在 `/ui/` 提供 doona。可选归档文件也解压到同一目录。

[文档](https://zakkaus.github.io/doona-docs/zh-CN/)包含系统要求、honk 与 doona 的安装、示例配置、首次登录、逐项检查功能与故障排查。

## 发布附件与软件包选择

手动安装选程序归档文件；通过软件包管理器安装则选对应系统的格式。下列为 v0.1.0-beta.14 的文件名，其他版本遵循相同的[命名方式](../install/README.md#version-spellings)。

| 格式        | 程序文件                              | 适用系统或方式                      |
| ----------- | ------------------------------------- | ----------------------------------- |
| tar.gz      | `doona-0.1.0-beta.14.tar.gz`          | 手动安装，由任意 Web 服务器提供     |
| deb         | `doona-web_0.1.0-beta.14-1_all.deb`   | Debian 或 Ubuntu                    |
| rpm         | `doona-0.1.0-beta.14-1.noarch.rpm`    | Fedora 或 openSUSE                  |
| Arch        | `doona-0.1.0beta14-1-any.pkg.tar.zst` | Arch Linux                          |
| ipk         | `doona_0.1.0-beta.14-1_all.ipk`       | OpenWrt 24.10 及更早版本，使用 opkg |
| OpenWrt apk | `doona-0.1.0_beta14-r1.apk`           | OpenWrt 25.12，使用 apk-tools 3     |
| Alpine apk  | `doona-0.1.0-beta.14-r0.alpine.apk`   | Alpine Linux                        |

Debian 与 Ubuntu 自带一个无关的 `doona` 软件包，因此 deb 名称为 `doona-web`，安装到 `/usr/share/doona-web`；请将 honk 的 `ui` 设为该路径。可选 deb 软件包为 `doona-web-fonts` 与 `doona-web-precompressed`。其他软件包格式保留 `doona` 名称，安装到 `/usr/share/doona`。Alpine 与 OpenWrt 的 apk 文件不能混用；签名密钥与安装命令见 [apk 安装说明](../install/README.md#installing-the-apk-packages)。

### 可选字体

`doona-fonts-<version>.tar.gz` 包含 Noto Sans TC 与 SC。要使用内置中文字体，可选择此归档文件或 `doona-fonts` 软件包；未安装时，界面使用备用字体。详见[字体说明](fonts.md)。

### 预压缩资源

Precompressed 指提前压缩。`doona-precompressed-<version>.tar.gz` 与 `doona-precompressed` 软件包在原始文件旁添加文本资源的 `.br` 与 `.gz` 压缩副本。

浏览器接受压缩内容时，honk 或 Web 服务器可以发送已压缩的文件，无需在每次请求时重新压缩。服务器无需耗费 CPU 压缩，传输量也更少，在较慢的网络上页面加载更快。此软件包为可选，不安装时主软件包不受影响。

压缩副本约多占用 1.6 MB 磁盘空间。

将预压缩归档文件解压到存放 doona 文件的目录。使用软件包时，安装与主软件包版本相同的 `doona-precompressed`。压缩副本针对至少 1 KiB 的文本资源，以 `brotli -q 11` 与 `gzip -9 -n` 生成，仅保留小于原始文件的副本。

## honk debug 归档文件与校验和

自 v0.1.0-beta.8 起，在 honk 发行含原生 API 的正式版本之前，每个 doona 发行版也附带预先构建的 `honk-core-debug-<target>[-stock].tar.gz`，用户无需自行编译 honk。归档文件包含 honk 原生 API 分支的 debug 构建，实现最终的原生 API 契约。

| 文件名部分            | 选择依据                               |
| --------------------- | -------------------------------------- |
| `x86_64` 或 `aarch64` | 网关的 CPU，与 `uname -m` 输出一致     |
| `unknown-linux-musl`  | 网关用静态二进制文件；不确定时选此格式 |
| `unknown-linux-gnu`   | 基于 glibc 的发行版                    |
| 无后缀                | 默认分配器 mimalloc                    |
| `-stock`              | 使用系统分配器代替 mimalloc            |

`HONK-SOURCE.txt` 注明构建所用的 honk 提交，`honk-source-<commit>.tar.gz` 为该提交的源码。`SHA256SUMS` 涵盖除自身以外的全部发布附件。[安装 honk](https://zakkaus.github.io/doona-docs/zh-CN/install.html#install) 说明如何按网关选择、验证和安装归档文件。

## 打包维护

软件包版本、打包配置、签名、本地构建与安装命令见 [install/README.md](../install/README.md)。
