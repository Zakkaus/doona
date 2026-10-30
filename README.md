<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的靜態 Web 介面：在瀏覽器中管理節點、群組、規則與組態。**

**[線上示範](https://demo.daeuniverse.org/)** / **[Lite 示範（預覽版）](https://demo.daeuniverse.org/lite/)** / **[文件](https://doona.daeuniverse.org/zh-TW/)**

繁體中文 / [简体中文](README.zh-CN.md) / [English](README.en.md)

[功能](#功能) / [兩個版本](#兩個版本) / [體驗示範版](#體驗示範版) / [安裝](#安裝) / [後端協定](#後端協定) / [文件](#文件)

</div>

doona 是用於監控代理流量、管理節點、群組、規則與組態的靜態 Web 介面。使用時需要正在運作且已啟用原生 API 的 [honk](https://github.com/daeuniverse/honk) 後端；目前不支援 dae。

![顯示流量圖表與狀態卡片的活動頁](https://doona.daeuniverse.org/screenshots/zh-TW/activity-light.webp)

## 功能

### 監控

- 編輯活動頁的卡片及其尺寸。
- 檢視連線、分流記錄與 DNS 查詢。
- 檢視後端日誌與事件。

![活動頁卡片的寬度與高度設定](https://doona.daeuniverse.org/screenshots/zh-TW/dashboard-settings.webp)

在活動頁調整卡片尺寸。

![分流頁地圖顯示經過所選規則或節點的流量路徑](https://doona.daeuniverse.org/screenshots/zh-TW/routing.webp)

分流頁地圖；選取規則或節點可檢視經過它的流量路徑。

### 節點與訂閱

- 一次貼上多個節點連結。
- 測試篩選後的節點，並依延遲排序。
- 更新訂閱並檢視探測結果。

![節點操作選單與探測結果](https://doona.daeuniverse.org/screenshots/zh-TW/node-actions.webp)

檢視節點的探測結果，並將節點加入群組。

### 群組與路由

- 編輯群組、成員篩選條件與選擇策略。
- 編輯規則清單並套用路由範本。
- 填寫行程名稱與防火牆標記，追蹤路由決策。

![策略群組編輯器](https://doona.daeuniverse.org/screenshots/zh-TW/group-editor.webp)

編輯群組的篩選條件與策略。

![進階檢視中的規則清單](https://doona.daeuniverse.org/screenshots/zh-TW/rules-advanced.webp)

在進階檢視中檢視規則清單。

### 組態

- 編輯設定檔，並透過診斷結果定位驗證錯誤。
- 透過表單修改全域設定。
- 檢視修訂並匯出組態。

![顯示驗證錯誤的設定檔編輯器](https://doona.daeuniverse.org/screenshots/zh-TW/config-diagnostics.webp)

在設定檔編輯器中定位驗證錯誤。

### 外觀與手機

- 選擇配色及淺色或深色主題。
- 使用英語、簡體中文或繁體中文。
- 在手機上使用頁面分頁、清單與選單。

![可用配色比較圖](https://doona.daeuniverse.org/screenshots/palettes.webp)

比較可用的配色。

![手機上的連線清單與外觀選單](https://doona.daeuniverse.org/screenshots/zh-TW/phone.webp)

在手機上瀏覽連線並調整外觀。

可用功能取決於後端的能力與組態，詳見[功能要求](https://doona.daeuniverse.org/zh-TW/feature-requirements.html)。

## 兩個版本

在 0.1.0-rc.4 中，doona lite 是仍在測試的預覽版，頁面與行為可能繼續變動。兩者連線同一個 honk，使用相同的管理員憑證。

| 項目       | 標準版                             | doona lite（預覽版）     |
| ---------- | ---------------------------------- | ------------------------ |
| 流量監控   | 活動、連線、分流、DNS、日誌與事件  | 不含監控頁面             |
| 組態       | 設定檔編輯器、診斷、全域設定與修訂 | 節點、訂閱與全域設定表單 |
| 群組與規則 | 編輯器、範本與路由追蹤             | 群組、路由與 DNS 編輯器  |
| 用途       | 用於日常管理的完整介面             | 體積更小的設定檔編輯器   |
| 狀態       | 候選版本                           | 仍在測試的預覽版         |

功能、後端要求及版本切換方式見[版本比較](https://doona.daeuniverse.org/zh-TW/editions.html)。

![doona lite 節點頁面](https://doona.daeuniverse.org/images/lite-nodes-light.webp)

## 體驗示範版

使用範例資料體驗介面，無需後端。

[標準版](https://demo.daeuniverse.org/)

[doona lite（預覽版）](https://demo.daeuniverse.org/lite/)

以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 開啟可檢視錯誤狀態，以 `?scenario=` 開啟則恢復正常的示範版。

## 安裝

honk 的完整發布版本已內嵌 doona。依照[快速入門](https://doona.daeuniverse.org/zh-TW/quick-start.html)即可使用；文件也說明如何單獨安裝 doona。

## 後端協定

honk 負責代理流量；支援的協定、傳輸方式與限制見 [honk 節點參考](https://github.com/daeuniverse/honk/blob/main/doc/zh/reference/nodes.md#协议)。

## 最新版本

[0.1.0-rc.4](CHANGELOG.md) 共 28 項更新：新增 6 項、變更 3 項、修正 19 項。

本版新增節點多選，可一起測試延遲或移除手動節點，另新增常用服務規則、萬聖節配色與「回報問題」按鈕。lite 的手動節點表單與後端設定加上欄位說明，錯誤與無法使用的狀態也會連到說明對應處理方式的文件段落。

## 文件

- [安裝與套件](docs/install.zh-TW.md)：[English](docs/install.md) / [简体中文](docs/install.zh-CN.md)
- [頁面、頁面導覽與手機版面](docs/pages.zh-TW.md)：[English](docs/pages.md) / [简体中文](docs/pages.zh-CN.md)
- [主題與配色](docs/themes.zh-TW.md)：[English](docs/themes.md) / [简体中文](docs/themes.zh-CN.md)
- [字型](docs/fonts.md)
- [國旗](docs/country-flags.md)
- [更新記錄](CHANGELOG.md)
- [文件站](https://doona.daeuniverse.org/zh-TW/)

## 開發

建置、測試與打包指令、原始碼配置與契約的固定提交，見[開發](https://doona.daeuniverse.org/zh-TW/development.html)一頁；送出 pull request 前先讀 [CONTRIBUTING.md](CONTRIBUTING.md)。

lite 的獨立相依套件安裝與建置指令見[開發](https://doona.daeuniverse.org/zh-TW/development.html#建置-doona-lite)一頁。

## 支援

介面問題與提問請到 [doona issues](https://github.com/Zakkaus/doona/issues)。代理、分流、DNS 等引擎問題請提交至 [honk issues](https://github.com/daeuniverse/honk/issues)。通報安全漏洞的方式見 [SECURITY.md](.github/SECURITY.md)。

## 授權與致謝

[GPL-3.0-only](LICENSE)。[Noto Sans TC 與 SC](docs/fonts.md) 由 Fontsource npm 套件提供，版權歸 Adobe 所有，採用 [Open Font License](LICENSES/OFL-1.1.txt)。[NOTICE](NOTICE) 註明 Adobe Spectrum 圖示（Apache-2.0）。
