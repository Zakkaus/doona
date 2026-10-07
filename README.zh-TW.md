<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的靜態 Web 介面：在瀏覽器中管理節點、群組、規則與組態。**

**[線上示範](https://demo.daeuniverse.org/)** / **[文件](https://zakkaus.github.io/doona-docs/zh-TW/)**

[English](README.md) / [简体中文](README.zh-CN.md) / 繁體中文

[體驗示範版](#體驗示範版) / [安裝](#安裝) / [後端協定](#後端協定) / [文件](#文件)

</div>

doona 是用於管理代理後端的靜態 Web 介面。檢視真實資料需要相容且正在運作的後端，並啟用原生 API；目前支援 [honk](https://github.com/daeuniverse/honk)。目前不支援 dae；相容性取決於 dae 未來是否實作同一份 API 契約。honk 或其他 Web 伺服器均可提供此介面。

依後端開放的功能，doona 可以：

- 監控流量、連線、事件與日誌。
- 管理節點與訂閱、更新訂閱、檢視探測結果。
- 管理群組、成員與節點選取。
- 檢視路由與 DNS 規則，編輯可寫入來源檔中的規則。
- 編輯組態來源檔、驗證變更、匯出來源檔。

## 體驗示範版

[開啟示範版](https://demo.daeuniverse.org/)即可使用範例資料體驗介面，無需後端。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 開啟可檢視錯誤狀態，以 `?scenario=` 開啟則恢復正常的示範版。

## 安裝

先按[安裝指南](https://zakkaus.github.io/doona-docs/zh-TW/install.html#install)選擇並設定支援原生 API 的 honk 版本，再從[發布頁](https://github.com/Zakkaus/doona/releases)下載 `doona-<version>.tar.gz`。
解壓縮到 honk `native_api` 組態區塊中 `ui` 指定的目錄，honk 即在 `/ui/` 提供 doona。
修改設定與組態需要後端授予寫入權限。各壓縮包的內容見[安裝說明](docs/install.zh-TW.md)。

## 後端協定

honk 負責代理流量，協定支援取決於後端版本與建置。其代理協定包括 SOCKS5、Shadowsocks/2022、Trojan、VMess、VLESS、AnyTLS、Hysteria2、TUIC 與 Juicity；支援的選項與限制見 [honk 節點參考](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#协议)。

WebSocket、gRPC 與 XHTTP 是串流傳輸方式，與代理協定不同。在支援 XHTTP 的 honk 版本中，Trojan／VMess／VLESS 使用 [H2 XHTTP 相容組態](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#h2-上的-xhttp)，不會回退到 H1/H3；參考文件列出支援的組合與限制。

![活動頁](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/activity-light.webp)

![組態檔與可編輯的原始文字檢視](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/config-source-light.webp)

## 最新版本

[beta.18](CHANGELOG.md) 新增已設定的串流傳輸方式顯示（包括 XHTTP），並修正發布打包流程，要求 honk 內嵌同版本的 doona。

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

## 支援

問題與提問請到 [issues](https://github.com/Zakkaus/doona/issues)。後端問題請提交到所連接引擎的專案：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。通報安全漏洞的方式見 [SECURITY.md](.github/SECURITY.md)。

## 授權與致謝

[GPL-3.0-only](LICENSE)。[Noto Sans TC 與 SC](docs/fonts.md) 由 Fontsource npm 套件提供，版權歸 Adobe 所有，採用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 註明 Adobe Spectrum 圖示（Apache-2.0）。
