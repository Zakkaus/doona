# 安裝與套件

[English](install.md) / [简体中文](install.zh-CN.md) / 繁體中文

## 狀態

doona 對接 honk `feat/native-api` 分支實作的原生 API；這套 API 尚未發行。契約的固定提交記錄在 [SOURCE.md](../contract/api-standardize/SOURCE.md)。後端缺少較新的資源鍵時，doona 會把這些鍵視為不可用。未設定後端時，內建模擬後端提供示範資料；README 與這些說明頁面的截圖全部來自模擬資料。

## 安裝

doona 需要 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。從[發布頁](https://github.com/Zakkaus/doona/releases)的同一標籤下載程式封存檔與 `SHA256SUMS`。

將 `doona-<version>.tar.gz` 解壓縮到 honk `native_api` 組態區塊中 `ui` 指定的目錄，honk 即在 `/ui/` 提供 doona。選用封存檔也解壓縮到同一目錄。

[文件](https://zakkaus.github.io/doona-docs/zh-TW/)涵蓋系統需求、honk 與 doona 的安裝、範例組態、首次登入、逐項檢查功能與疑難排解。

## 發布檔案

每次發布有 38 個檔案。大多數使用者只需兩個：適用於自己系統的程式檔案與 `SHA256SUMS`。下列為 v0.1.0-beta.14 的檔名，其他版本依相同的[命名方式](../install/README.md#version-spellings)。

### 程式

手動安裝或透過系統的套件管理員安裝，選擇其中一個。

| 檔案                                  | 內容                                 | 適用系統或方式                  |
| ------------------------------------- | ------------------------------------ | ------------------------------- |
| `doona-0.1.0-beta.14.tar.gz`          | 建置好的 UI 與授權條款，不含安裝程式 | 手動安裝，由任一 Web 伺服器提供 |
| `doona-web_0.1.0-beta.14-1_all.deb`   | Debian 套件                          | Debian 或 Ubuntu                |
| `doona-0.1.0-beta.14-1.noarch.rpm`    | RPM 套件                             | Fedora 或 openSUSE              |
| `doona-0.1.0beta14-1-any.pkg.tar.zst` | pacman 套件                          | Arch Linux                      |
| `doona_0.1.0-beta.14-1_all.ipk`       | opkg 套件                            | OpenWrt 24.10 及更早版本        |
| `doona-0.1.0_beta14-r1.apk`           | apk-tools 3 套件                     | OpenWrt 25.12                   |
| `doona-0.1.0-beta.14-r0.alpine.apk`   | Alpine 套件                          | Alpine Linux                    |

Debian 與 Ubuntu 內建一個無關的 `doona` 套件，因此 deb 名稱為 `doona-web`，安裝至 `/usr/share/doona-web`；請將 honk 的 `ui` 設為該路徑。其他套件格式保留 `doona` 名稱，安裝至 `/usr/share/doona`。Alpine 與 OpenWrt 的 apk 檔案不能混用。

### 選用附加套件

每個附加套件都提供與程式相同的格式，名稱包含 `fonts` 或 `precompressed`，例如 `doona-fonts-0.1.0-beta.14.tar.gz`、`doona-web-fonts_0.1.0-beta.14-1_all.deb`、`doona-fonts_0.1.0-beta.14-1_all.ipk` 等。請安裝與程式相同格式、相同版本的附加套件。

| 名稱部分        | 新增的內容                                                                       | 何時安裝                                                   |
| --------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `fonts`         | Noto Sans TC 與 SC，約 8 MB                                                      | 要使用內建中文字型而非系統字型時。詳見[字型說明](fonts.md) |
| `precompressed` | 文字資源的 `.br` 與 `.gz` 壓縮副本，約 1.6 MB                                    | 伺服器與桌面系統；路由器上選用                             |
| `doc`（Alpine） | `doona-doc-0.1.0-beta.14-r0.alpine.apk`：NOTICE 檔案，依 Alpine 套件慣例單獨拆分 | 很少需要                                                   |

Precompressed 意為預先壓縮。瀏覽器接受壓縮內容時，honk 或 Web 伺服器傳送 `.br` 或 `.gz` 副本，無須在每次請求時重新壓縮，因此伺服器不必花 CPU 壓縮，在較慢的網路上頁面載入更快。壓縮副本針對至少 1 KiB 的文字資源，以 `brotli -q 11` 與 `gzip -9 -n` 產生，僅保留小於原始檔案的副本。手動安裝時，將封存檔解壓縮到存放 doona 檔案的目錄。

### apk 簽章金鑰

| 檔案                   | 內容                         | 使用方式                               |
| ---------------------- | ---------------------------- | -------------------------------------- |
| `doona-alpine.rsa.pub` | 用於驗證 Alpine 套件的公鑰   | Alpine：複製到 `/etc/apk/keys/`        |
| `doona-openwrt.pem`    | 用於驗證 OpenWrt 索引的公鑰  | OpenWrt 25.12：複製到 `/etc/apk/keys/` |
| `doona-openwrt.adb`    | OpenWrt apk 套件的已簽章索引 | OpenWrt 25.12：由 `apk add -X` 讀取    |

每次發布都使用新的金鑰簽章。見 [apk 安裝說明](../install/README.md#installing-the-apk-packages)。

### honk

自 v0.1.0-beta.8 起，在 honk 發行含原生 API 的版本之前，每次 doona 發布也附上 honk 建置，使用者不需自行編譯 honk。這些建置是 honk 原生 API 分支的 debug 預發布版本的原樣副本。

| 檔案                                      | 內容                                        |
| ----------------------------------------- | ------------------------------------------- |
| `honk-core-debug-<target>[-stock].tar.gz` | 每個目標一個 honk 建置，共八個              |
| `HONK-SOURCE.txt`                         | honk 發布版本與提交，以及每個建置的 SHA-256 |
| `honk-source-<commit>.tar.gz`             | honk 在該提交的原始碼                       |

| 檔名部分              | 選擇依據                                 |
| --------------------- | ---------------------------------------- |
| `x86_64` 或 `aarch64` | 閘道器的 CPU，與 `uname -m` 輸出一致     |
| `unknown-linux-musl`  | 閘道器用靜態二進位檔案；不確定時選此格式 |
| `unknown-linux-gnu`   | 基於 glibc 的發行版                      |
| 無後綴                | 預設配置器 mimalloc                      |
| `-stock`              | 使用系統配置器代替 mimalloc              |

[安裝 honk](https://zakkaus.github.io/doona-docs/zh-TW/install.html#install) 說明如何依閘道器選擇、驗證與安裝建置。

### 校驗和與原始碼

| 檔案                                    | 內容                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SHA256SUMS`                            | 除自身以外的每個發布檔案的 SHA-256；使用 `sha256sum -c --ignore-missing SHA256SUMS` 檢查下載的檔案 |
| Source code (zip), Source code (tar.gz) | doona 在發布標籤處的原始碼，由 GitHub 新增                                                         |

## 打包維護

套件版本、打包設定、簽章、本機建置與安裝指令見 [install/README.md](../install/README.md)。
