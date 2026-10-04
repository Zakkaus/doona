# 安裝與套件

[English](install.md) / [简体中文](install.zh-CN.md) / 繁體中文

## 狀態

doona 對接 honk `feat/native-api` 分支實作的原生 API；這套 API 尚未發行。契約的固定提交記錄在 [SOURCE.md](../contract/api-standardize/SOURCE.md)。後端缺少較新的資源鍵時，doona 會把這些鍵視為不可用。未設定後端時，內建模擬後端提供示範資料；README 與這些說明頁面的截圖全部來自模擬資料。

## 安裝

doona 需要 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。從[發布頁](https://github.com/Zakkaus/doona/releases)的同一標籤下載程式封存檔與 `SHA256SUMS`。

將 `doona-<version>.tar.gz` 解壓縮到 honk `native_api` 組態區塊中 `ui` 指定的目錄，honk 即在 `/ui/` 提供 doona。選用封存檔也解壓縮到同一目錄。

[文件](https://zakkaus.github.io/doona-docs/zh-TW/)涵蓋系統需求、honk 與 doona 的安裝、範例組態、首次登入、逐項檢查功能與疑難排解。

## 發布附件與套件選擇

手動安裝選程式封存檔；透過套件管理員安裝則選對應系統的格式。下列為 v0.1.0-beta.14 的檔名，其他版本依相同的[命名方式](../install/README.md#version-spellings)。

| 格式        | 程式檔案                              | 適用系統或方式                      |
| ----------- | ------------------------------------- | ----------------------------------- |
| tar.gz      | `doona-0.1.0-beta.14.tar.gz`          | 手動安裝，由任一 Web 伺服器提供     |
| deb         | `doona-web_0.1.0-beta.14-1_all.deb`   | Debian 或 Ubuntu                    |
| rpm         | `doona-0.1.0-beta.14-1.noarch.rpm`    | Fedora 或 openSUSE                  |
| Arch        | `doona-0.1.0beta14-1-any.pkg.tar.zst` | Arch Linux                          |
| ipk         | `doona_0.1.0-beta.14-1_all.ipk`       | OpenWrt 24.10 及更早版本，使用 opkg |
| OpenWrt apk | `doona-0.1.0_beta14-r1.apk`           | OpenWrt 25.12，使用 apk-tools 3     |
| Alpine apk  | `doona-0.1.0-beta.14-r0.alpine.apk`   | Alpine Linux                        |

Debian 與 Ubuntu 內建一個無關的 `doona` 套件，因此 deb 名稱為 `doona-web`，安裝至 `/usr/share/doona-web`；請將 honk 的 `ui` 設為該路徑。選用 deb 套件為 `doona-web-fonts` 與 `doona-web-precompressed`。其他套件格式保留 `doona` 名稱，安裝至 `/usr/share/doona`。Alpine 與 OpenWrt 的 apk 檔案不能混用；簽章金鑰與安裝指令見 [apk 安裝說明](../install/README.md#installing-the-apk-packages)。

### 選用字型

`doona-fonts-<version>.tar.gz` 包含 Noto Sans TC 與 SC。要使用內建中文字型，可選擇此封存檔或 `doona-fonts` 套件；未安裝時，介面使用備用字型。詳見[字型說明](fonts.md)。

### 預先壓縮的資源

Precompressed 指預先壓縮。`doona-precompressed-<version>.tar.gz` 與 `doona-precompressed` 套件在原始檔案旁新增文字資源的 `.br` 與 `.gz` 壓縮副本。

瀏覽器接受壓縮內容時，honk 或 Web 伺服器可以傳送已壓縮的檔案，無須在每次請求時重新壓縮。伺服器不必花 CPU 壓縮，傳輸量也較少，在較慢的網路上頁面載入更快。此套件為選用，不安裝時主套件不受影響。

壓縮副本約多占 1.6 MB 磁碟空間。

將預先壓縮的封存檔解壓縮到存放 doona 檔案的目錄。使用套件時，安裝與主套件版本相同的 `doona-precompressed`。壓縮副本針對至少 1 KiB 的文字資源，以 `brotli -q 11` 與 `gzip -9 -n` 產生，僅保留小於原始檔案的副本。

## honk debug 封存檔與校驗和

自 v0.1.0-beta.8 起，在 honk 發行含原生 API 的正式版本之前，每個 doona 發行版也附上預先建置的 `honk-core-debug-<target>[-stock].tar.gz`，使用者不需自行編譯 honk。封存檔包含 honk 原生 API 分支的 debug 建置，實作最終的原生 API 契約。

| 檔名部分              | 選擇依據                                 |
| --------------------- | ---------------------------------------- |
| `x86_64` 或 `aarch64` | 閘道器的 CPU，與 `uname -m` 輸出一致     |
| `unknown-linux-musl`  | 閘道器用靜態二進位檔案；不確定時選此格式 |
| `unknown-linux-gnu`   | 基於 glibc 的發行版                      |
| 無後綴                | 預設配置器 mimalloc                      |
| `-stock`              | 使用系統配置器代替 mimalloc              |

`HONK-SOURCE.txt` 註明建置所用的 honk 提交，`honk-source-<commit>.tar.gz` 為該提交的原始碼。`SHA256SUMS` 涵蓋除自身以外的所有發布附件。[安裝 honk](https://zakkaus.github.io/doona-docs/zh-TW/install.html#install) 說明如何依閘道器選擇、驗證與安裝封存檔。

## 打包維護

套件版本、打包設定、簽章、本機建置與安裝指令見 [install/README.md](../install/README.md)。
