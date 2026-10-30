# 安裝與套件

[English](install.md) / [简体中文](install.zh-CN.md) / 繁體中文

doona 以靜態網頁檔案發布。目前版本為 v0.1.0-rc.4；doona lite 是測試中的預覽版。

安裝請參閱文件站的[系統需求](https://doona.daeuniverse.org/zh-TW/requirements.html)、[安裝指南](https://doona.daeuniverse.org/zh-TW/install.html)與 [doona lite 指南](https://doona.daeuniverse.org/zh-TW/lite.html)。這些頁面說明後端設定、各發行版的安裝步驟與首次登入。本頁說明本倉庫建置的檔案。honk 建置的下載位置見[配套 honk 建置](#配套-honk-建置)。

## 發布封存檔

[tools/package.sh](../tools/package.sh) 在 `release/` 下產生以下封存檔。`<version>` 是去掉標籤開頭 `v` 的版本號。

| 封存檔                                 | 內容                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `doona-<version>.tar.gz`               | `dist/` 中的標準版，排除 `fonts/` 與 `.vite/`，加入授權與聲明檔案         |
| `doona-lite-<version>.tar.gz`          | `apps/lite/dist/` 中的 lite 版，加入授權與聲明檔案；使用系統字型          |
| `doona-fonts-<version>.tar.gz`         | 選用的 `fonts/` 目錄，包含 Noto Sans TC 與 SC 子集、`OFL.txt` 和 `README` |
| `doona-precompressed-<version>.tar.gz` | 標準版文字資源的選用 `.br` 與 `.gz` 副本，保留原資源的相對路徑            |

兩個程式封存檔都將 `index.html` 放在根目錄，並包含 `LICENSE`、`LICENSES/`、`NOTICE`、`README.md`、`README.en.md` 與 `THIRD-PARTY-NOTICES.txt`。[tools/notices.mjs](../tools/notices.mjs) 收集打包依賴的授權條款。程式封存檔不包含 `CHANGELOG.md`。

預壓縮封存檔包含指定類型中至少 1 KiB 的文字資源副本。打包使用 `brotli -q 11` 與 `gzip -9 -n`，僅保留比原檔案小的副本。字型單獨打包，詳見[字型](fonts.md)。

## 配套 honk 建置

內嵌 doona 的建置由 honk 自己的 release 提供：完整建置以 `ui: embedded` 提供本介面，`ui: embedded-lite` 則提供 doona lite。doona 發布說明的 Pairing with honk 一節列出配套的 honk 版本，請到該 [honk release](https://github.com/daeuniverse/honk/releases) 下載；doona 的 release 不附 honk 建置。

完整建置的檔名為 `honk-core-v<version>-<target>[-stock]-full.tar.gz`。八種建置涵蓋 x86_64 與 aarch64、musl 與 GNU，並分別使用 mimalloc 或系統記憶體配置器（`-stock`）。不確定時選擇 musl。每個 honk release 也附有 `doona-source-<version>.tar.gz`，即內嵌介面的對應原始碼。

## 套件布局

| 套件或建置配方                                         | 介面目錄               |
| ------------------------------------------------------ | ---------------------- |
| Debian `doona-web`                                     | `/usr/share/doona-web` |
| RPM、Arch 與 OpenWrt 的 `doona`；Alpine 與 Gentoo 配方 | `/usr/share/doona`     |
| Nix 配方                                               | `$out/share/doona`     |
| 手動解壓的封存檔                                       | 解壓時選擇的目錄       |

Debian 附加套件名為 `doona-web-fonts` 與 `doona-web-precompressed`，其他發行版的套件使用 `doona-fonts` 與 `doona-precompressed`。字型放在介面目錄的 `fonts/` 下，預壓縮檔案與原資源並列。Alpine 與 OpenWrt 的 apk 套件分別建置，並使用各自的簽章流程。

套件檔名與中繼資料採用不同的預發布版本寫法。詳見打包參考中的[版本寫法](../install/README.md#version-spellings)與 [apk 簽章及安裝](../install/README.md#installing-the-apk-packages)。

Alpine 還提供 `doona-doc-<version>-r0.alpine.apk`，其中包含 `NOTICE` 檔案。

## 建置與打包原始碼

| 原始碼                                                                                                                         | 職責                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [tools/package.sh](../tools/package.sh)                                                                                        | 暫存兩個版本的檔案，拆分選用封存檔，產生這些封存檔的 `SHA256SUMS` |
| [.github/workflows/release.yml](../.github/workflows/release.yml)                                                              | 建置發行版套件，彙整發布檔案，重新產生 `SHA256SUMS`               |
| [install/nfpm/](../install/nfpm/)                                                                                              | Debian、RPM、Arch 與 ipk 套件定義                                 |
| [install/alpine/APKBUILD](../install/alpine/APKBUILD)                                                                          | Alpine 套件與子套件                                               |
| [install/openwrt/doona/Makefile](../install/openwrt/doona/Makefile)                                                            | OpenWrt 套件與附加套件                                            |
| [install/gentoo/net-proxy/doona/](../install/gentoo/net-proxy/doona/) 與 [install/nix/package.nix](../install/nix/package.nix) | Gentoo 與 Nix 配方                                                |

打包前必須先建置兩個版本，即使只需要標準版封存檔。依賴安裝與建置命令見[開發指南](https://doona.daeuniverse.org/zh-TW/development.html)，套件維護見 [install/README.md](../install/README.md)。
