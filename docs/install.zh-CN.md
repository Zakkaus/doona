# 安装与软件包

[English](install.md) / 简体中文 / [繁體中文](install.zh-TW.md)

doona 以静态网页文件发布。当前版本为 v0.1.0-rc.4；doona lite 是测试中的预览版。

安装请参阅文档站的[系统要求](https://doona.daeuniverse.org/zh-CN/requirements.html)、[安装指南](https://doona.daeuniverse.org/zh-CN/install.html)与 [doona lite 指南](https://doona.daeuniverse.org/zh-CN/lite.html)。这些页面说明后端配置、各发行版的安装步骤与首次登录。本页说明本仓库构建的文件。honk 构建的下载位置见[配套 honk 构建](#配套-honk-构建)。

## 发布压缩包

[tools/package.sh](../tools/package.sh) 在 `release/` 下生成以下压缩包。`<version>` 是去掉标签开头 `v` 的版本号。

| 压缩包                                 | 内容                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `doona-<version>.tar.gz`               | `dist/` 中的标准版，排除 `fonts/` 与 `.vite/`，加入许可证与声明文件       |
| `doona-lite-<version>.tar.gz`          | `apps/lite/dist/` 中的 lite 版，加入许可证与声明文件；使用系统字体        |
| `doona-fonts-<version>.tar.gz`         | 可选的 `fonts/` 目录，包含 Noto Sans TC 与 SC 子集、`OFL.txt` 和 `README` |
| `doona-precompressed-<version>.tar.gz` | 标准版文本资源的可选 `.br` 与 `.gz` 副本，保留原资源的相对路径            |

两个程序压缩包都将 `index.html` 放在根目录，并包含 `LICENSE`、`LICENSES/`、`NOTICE`、`README.md`、`README.en.md` 与 `THIRD-PARTY-NOTICES.txt`。[tools/notices.mjs](../tools/notices.mjs) 收集打包依赖的许可证文本。程序压缩包不包含 `CHANGELOG.md`。

预压缩包包含指定类型中至少 1 KiB 的文本资源副本。打包使用 `brotli -q 11` 与 `gzip -9 -n`，仅保留比原文件小的副本。字体单独打包，详见[字体](fonts.md)。

## 配套 honk 构建

内嵌 doona 的构建由 honk 自己的 release 提供：完整构建以 `ui: embedded` 提供本界面，`ui: embedded-lite` 则提供 doona lite。doona 发布说明的 Pairing with honk 一节列出配套的 honk 版本，请到该 [honk release](https://github.com/daeuniverse/honk/releases) 下载；doona 的 release 不附 honk 构建。

完整构建的文件名为 `honk-core-v<version>-<target>[-stock]-full.tar.gz`。八种构建覆盖 x86_64 与 aarch64、musl 与 GNU，并分别使用 mimalloc 或系统内存分配器（`-stock`）。不确定时选择 musl。每个 honk release 也附有 `doona-source-<version>.tar.gz`，即内嵌界面的对应源码。

## 软件包布局

| 软件包或构建配方                                       | 界面目录               |
| ------------------------------------------------------ | ---------------------- |
| Debian `doona-web`                                     | `/usr/share/doona-web` |
| RPM、Arch 与 OpenWrt 的 `doona`；Alpine 与 Gentoo 配方 | `/usr/share/doona`     |
| Nix 配方                                               | `$out/share/doona`     |
| 手动解压的压缩包                                       | 解压时选择的目录       |

Debian 附加包名为 `doona-web-fonts` 与 `doona-web-precompressed`，其他发行版的软件包使用 `doona-fonts` 与 `doona-precompressed`。字体放在界面目录的 `fonts/` 下，预压缩文件与原资源并列。Alpine 与 OpenWrt 的 apk 包分别构建，并使用各自的签名流程。

软件包文件名与元数据采用不同的预发布版本写法。详见打包参考中的[版本写法](../install/README.md#version-spellings)与 [apk 签名及安装](../install/README.md#installing-the-apk-packages)。

Alpine 还提供 `doona-doc-<version>-r0.alpine.apk`，其中包含 `NOTICE` 文件。

## 构建与打包源码

| 源码                                                                                                                           | 职责                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [tools/package.sh](../tools/package.sh)                                                                                        | 暂存两个版本的文件，拆分可选压缩包，生成这些压缩包的 `SHA256SUMS` |
| [.github/workflows/release.yml](../.github/workflows/release.yml)                                                              | 构建发行版软件包，汇总发布文件，重新生成 `SHA256SUMS`             |
| [install/nfpm/](../install/nfpm/)                                                                                              | Debian、RPM、Arch 与 ipk 软件包定义                               |
| [install/alpine/APKBUILD](../install/alpine/APKBUILD)                                                                          | Alpine 软件包与子包                                               |
| [install/openwrt/doona/Makefile](../install/openwrt/doona/Makefile)                                                            | OpenWrt 软件包与附加包                                            |
| [install/gentoo/net-proxy/doona/](../install/gentoo/net-proxy/doona/) 与 [install/nix/package.nix](../install/nix/package.nix) | Gentoo 与 Nix 配方                                                |

打包前必须先构建两个版本，即使只需要标准版压缩包。依赖安装与构建命令见[开发指南](https://doona.daeuniverse.org/zh-CN/development.html)，软件包维护见 [install/README.md](../install/README.md)。
