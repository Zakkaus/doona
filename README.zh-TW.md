<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的靜態 Web 介面：在瀏覽器中管理節點、群組、規則與組態。**

**[線上示範](https://demo.daeuniverse.org/)** / **[文件](https://zakkaus.github.io/doona-docs/zh-TW/)**

[English](README.md) / [简体中文](README.zh-CN.md) / 繁體中文

[兩個版本](#兩個版本) / [體驗示範版](#體驗示範版) / [安裝](#安裝) / [後端協定](#後端協定) / [文件](#文件)

</div>

doona 是用於管理代理後端的靜態 Web 介面。檢視真實資料需要相容且正在運作的後端，並啟用原生 API；目前支援 [honk](https://github.com/daeuniverse/honk)。目前不支援 dae；相容性取決於 dae 未來是否實作同一份 API 契約。honk 或其他 Web 伺服器均可提供此介面。

依後端開放的功能，doona 可以：

- 監控流量、連線、事件與日誌。
- 管理節點與訂閱、更新訂閱、檢視探測結果。
- 管理群組、成員與節點選取。
- 檢視路由與 DNS 規則，編輯可寫入來源檔中的規則。
- 編輯組態來源檔、驗證變更、匯出來源檔。

## 兩個版本

標準版是 doona 的完整介面，提供流量監控、組態編輯、設定與配色。
doona lite 是面向新手的精簡組態編輯器，不含流量頁面。

兩個版本使用相同的 honk 原生 API 與 honk 組態，均使用管理員密碼或權杖登入。honk 一次只提供一個版本；將 `ui` 指向另一個目錄並重新啟動 honk 即可切換。兩個版本不會覆寫彼此的檔案或瀏覽器設定。

|          | 標準版                                                                                                            | doona lite                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 適用情境 | 監控流量與管理組態                                                                                                | 新手編輯組態                                                      |
| 頁面     | 活動、系統狀態、連線、路由日誌、DNS、日誌、事件、節點、群組、規則、追蹤、組態與設定                               | 節點、訂閱、群組、路由、DNS 與全域設定；不含流量頁面              |
| 安裝     | 將 `doona-<version>.tar.gz` 解壓縮到 `/usr/share/doona`，或在 honk-core 發布建置中使用 `ui: embedded`（僅標準版） | 將 `doona-lite-<version>.tar.gz` 解壓縮到 `/usr/share/doona-lite` |
| 示範     | [標準版示範](https://demo.daeuniverse.org/)                                                                       | [lite 示範](https://demo.daeuniverse.org/lite/)                   |
| 文件     | [標準版指南](https://zakkaus.github.io/doona-docs/zh-TW/)                                                         | [lite 指南](https://zakkaus.github.io/doona-docs/zh-TW/lite.html) |

<img src="https://zakkaus.github.io/doona-docs/images/lite-nodes-light.webp" width="100%" alt="doona lite 節點頁面">

詳細差異見[版本比較](https://zakkaus.github.io/doona-docs/zh-TW/editions.html)。

## 體驗示範版

[開啟示範版](https://demo.daeuniverse.org/)即可使用範例資料體驗介面，無需後端。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 開啟可檢視錯誤狀態，以 `?scenario=` 開啟則恢復正常的示範版。

也可開啟 [lite 示範版](https://demo.daeuniverse.org/lite/)，體驗精簡的組態編輯器。

## 安裝

先按[安裝指南](https://zakkaus.github.io/doona-docs/zh-TW/install.html#install)選擇並設定支援原生 API 的 honk 版本，再從[發布頁](https://github.com/Zakkaus/doona/releases)下載 `doona-<version>.tar.gz`。
解壓縮到 honk `native_api` 組態區塊中 `ui` 指定的目錄，honk 即在 `/ui/` 提供 doona。
同一次發布還提供 `doona-lite-<version>.tar.gz`；將其解壓縮到獨立目錄 `/usr/share/doona-lite`，透過 `ui` 選擇版本，具體步驟見 [lite 指南](https://zakkaus.github.io/doona-docs/zh-TW/lite.html)。
修改設定與組態需要後端授予寫入權限。各壓縮包的內容見[安裝說明](docs/install.zh-TW.md)。

## 後端協定

honk 負責代理流量，協定支援取決於後端版本與建置。其代理協定包括 SOCKS5、Shadowsocks/2022、Trojan、VMess、VLESS、AnyTLS、Hysteria2、TUIC 與 Juicity；支援的選項與限制見 [honk 節點參考](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#协议)。

WebSocket、gRPC 與 XHTTP 是串流傳輸方式，與代理協定不同。在支援 XHTTP 的 honk 版本中，Trojan／VMess／VLESS 使用 [H2 XHTTP 相容組態](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#h2-上的-xhttp)，不會回退到 H1/H3；參考文件列出支援的組合與限制。

![活動頁](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/activity-light.webp)

![組態檔與可編輯的原始文字檢視](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/config-source-light.webp)

## 最新版本

[rc.1](CHANGELOG.md) 在 http 頁面上建議後端位址，建議中的 IPv6 主機不再重複方括號，並修復表格換行對齊與路由追蹤的程序欄位。

## 文件

- [安裝與套件](docs/install.zh-TW.md)：[English](docs/install.md) / [简体中文](docs/install.zh-CN.md)
- [頁面、頁面導覽與手機版面](docs/pages.zh-TW.md)：[English](docs/pages.md) / [简体中文](docs/pages.zh-CN.md)
- [主題與配色](docs/themes.zh-TW.md)：[English](docs/themes.md) / [简体中文](docs/themes.zh-CN.md)
- [字型](docs/fonts.md)
- [國旗](docs/country-flags.md)
- [更新記錄](CHANGELOG.md)
- [文件站](https://zakkaus.github.io/doona-docs/zh-TW/)

## 開發

建置、測試與打包指令、原始碼配置與契約的固定提交，見[開發](https://zakkaus.github.io/doona-docs/zh-TW/development.html)一頁；送出 pull request 前先讀 [CONTRIBUTING.md](CONTRIBUTING.md)。

doona lite 的原始碼位於 `apps/lite`，在儲存庫根目錄執行 `pnpm --dir apps/lite build` 即可建置。

## 支援

問題與提問請到 [issues](https://github.com/Zakkaus/doona/issues)。後端問題請提交到所連接引擎的專案：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。通報安全漏洞的方式見 [SECURITY.md](.github/SECURITY.md)。

## 授權與致謝

[GPL-3.0-only](LICENSE)。[Noto Sans TC 與 SC](docs/fonts.md) 由 Fontsource npm 套件提供，版權歸 Adobe 所有，採用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 註明 Adobe Spectrum 圖示（Apache-2.0）。
