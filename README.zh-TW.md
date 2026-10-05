<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的 Web 介面：在瀏覽器中管理節點、群組、規則與組態。**

**[線上示範](https://demo.daeuniverse.org/)** / **[文件](https://zakkaus.github.io/doona-docs/zh-TW/)**

[English](README.md) / [简体中文](README.zh-CN.md) / 繁體中文

[安裝](#安裝) / [文件](#文件) / [開發](#開發)

</div>

doona 是 daeuniverse 引擎共用原生 API 的靜態 Web 介面，顯示引擎狀態，並管理節點、群組、路由規則與組態檔。目前支援 honk；dae 實作同一份契約後也可使用。引擎或任一 Web 伺服器均可提供此介面。

[使用範例資料體驗示範版](https://demo.daeuniverse.org/)。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 開啟示範版可檢視錯誤狀態，以 `?scenario=` 開啟則恢復正常的示範版。

![活動頁](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/activity-light.webp)

[beta.15 更新記錄](CHANGELOG.md)列出 6 項新增、23 項變更與 21 項修正，包括四種 Glass 配色、外觀設定，以及即時事件表格的記憶體洩漏修正。

![組態檔與可編輯的原始文字檢視](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/config-source-light.webp)

## 安裝

從[發布頁](https://github.com/Zakkaus/doona/releases)下載 `doona-<version>.tar.gz`。
解壓縮到 honk `native_api` 組態區塊中 `ui` 指定的目錄，honk 即在 `/ui/` 提供 doona。
安裝步驟與套件選擇見[安裝說明](docs/install.zh-TW.md)及[文件站的安裝指南](https://zakkaus.github.io/doona-docs/zh-TW/install.html#install)。

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
