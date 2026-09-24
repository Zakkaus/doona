<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
  <img src="docs/logo-light.svg" width="104" alt="doona">
</picture>

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的 Web 介面：在瀏覽器中管理節點、群組、規則與組態。**

[English](README.md) · [简体中文](README.zh-CN.md) · 繁體中文

[安裝](#安裝) • [第一次使用](#第一次使用) • [頁面](#頁面) • [開發](#開發) • [使用指南](docs/guide.zh-TW.md)

</div>

doona 是 daeuniverse 引擎共用原生 API 的靜態 Web 介面：現在是 honk，dae 實作同一份契約後亦可。它由引擎自己或任一 Web 伺服器提供，顯示引擎當下的狀態，並管理節點、群組、路由規則與組態檔。

[使用範例資料體驗示範版](https://zakkaus.github.io/doona/)。

![活動頁](docs/screenshots/zh-TW/activity-light.webp)

<details>
<summary><strong>全部配色</strong></summary>

十一套配色各有淺色與深色；Rosé Pine 與 Catppuccin 另有多種深色變體。配色在頂欄切換。

<img src="docs/screenshots/palettes.webp" alt="全部配色的淺色與深色" width="100%">

</details>

## 配色範例

下圖展示活動頁的四種配色。可在頂欄切換配色和模式。

| 配色       | 淺色                                                                | 深色                                                               |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Rosé Pine  | ![Rosé Pine 淺色](docs/screenshots/en/theme-rose-pine-light.webp)   | ![Rosé Pine 深色](docs/screenshots/en/theme-rose-pine-dark.webp)   |
| Catppuccin | ![Catppuccin 淺色](docs/screenshots/en/theme-catppuccin-light.webp) | ![Catppuccin 深色](docs/screenshots/en/theme-catppuccin-dark.webp) |
| Nord       | ![Nord 淺色](docs/screenshots/en/theme-nord-light.webp)             | ![Nord 深色](docs/screenshots/en/theme-nord-dark.webp)             |
| Glass      | ![Glass 淺色](docs/screenshots/en/theme-glass-light.webp)           | ![Glass 深色](docs/screenshots/en/theme-glass-dark.webp)           |

## 狀態

doona 對接 honk `feat/native-api` 分支實作的原生 API；這套 API 尚未發行。契約的釘點記錄在 [SOURCE.md](contract/api-standardize/SOURCE.md)。後端缺少較新的資源鍵時，doona 會把這些鍵視為不可用。未設定後端時，內建模擬後端提供示範資料；本文截圖全部來自模擬資料。

## 安裝

發行檔（`doona-<version>.tar.gz`、選用的 `doona-fonts-<version>.tar.gz`（Noto Sans TC 與 SC）、`SHA256SUMS`）附在[發行頁](https://github.com/Zakkaus/doona/releases)的標籤上；第一個發行標籤發布之前，請依[開發](#開發)一節自行建置。驗證檔案並解壓至引擎或 Web 伺服器提供檔案的目錄：

```sh
VERSION=v0.1.0-beta.2  # 替換為下載檔案對應的發行標籤
sha256sum --ignore-missing -c SHA256SUMS
sudo mkdir -p /usr/share/doona
sudo tar -xzf "doona-${VERSION}.tar.gz" -C /usr/share/doona
if [ -f "doona-fonts-${VERSION}.tar.gz" ]; then
    sudo tar -xzf "doona-fonts-${VERSION}.tar.gz" -C /usr/share/doona
fi
```

### honk 原生 API 要求

**所需 honk 建置：**doona 需要 [Glassyiris/honk 的 `feat/native-api` 分支](https://github.com/Glassyiris/honk/tree/feat/native-api)提供的原生 API；daeuniverse/honk 尚無包含此功能的正式發行版本。`native_api` 與 `password_auth` 設定項目在上游發行前可能變更。已發行的 honk 對 `/api` 與 `/ui/` 回傳 404。下方設定僅適用於該分支。

honk 的原生 API 需要明確開啟。把 `ui` 指向解壓後的目錄，honk 就在 `/ui/` 提供這些檔案，與 API 同源：

```dae
experimental {
    native_api {
        enabled: true
        listen: '127.0.0.1:9527'
        password_auth: true
        ui: '/usr/share/doona'
    }
}
```

這個區塊請放在獨立的 include（`include { api.dae }`），主檔才能在組態頁編輯。供指令碼和自動化程式使用時，以 `secret: '<random token>'` 取代 `password_auth: true`。執行環境、由其他 Web 伺服器或反向代理提供、發行版套件，見[使用指南](docs/guide.zh-TW.md#安裝)。

## 第一次使用

在引擎主機上開 `/ui/`。第一次造訪時，doona 向提供頁面的來源請求 `/api`，並將引擎儲存為後端。密碼模式下，鎖定的登入對話方塊提供首次設定入口，用於建立管理員；請從本機或私人網路用戶端完成設定，再以使用者名稱和密碼登入。若頁面來自別處，或要連另一台引擎，開設定頁填伺服器根位址。

token 模式下，doona 會提示輸入 token。可在設定頁填入伺服器根位址和 token，或使用配對連結（`/ui/#/settings?api=http://router:9527&token=…`）代填表單；載入後，doona 會從網址列移除 token。

接著活動頁顯示執行中的引擎。在節點頁新增訂閱或貼入分享連結，在策略頁選擇或固定群組成員，在規則頁加規則，在組態頁編輯、校驗並重載來源。每次寫入都帶著讀取時的雜湊經過引擎；重載失敗時仍沿用先前的世代。各頁面的用法見[使用指南](docs/guide.zh-TW.md#第一次使用)。

## 頁面

<img src="docs/screenshots/zh-TW/policies-light.webp" alt="策略頁" width="100%">

| 頁面       | 內容                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 活動       | 出站模式、流量與記憶體、活動連線、節點延遲、出站用量、流量最高的客戶端、通知           |
| 概覽       | 引擎與 eBPF 狀態、流量計數、後端能力、狀態 JSON 匯出                                   |
| 連線       | 即時連線的來源、目的、規則、鏈路與流量；關閉單條或全部                                 |
| DNS        | 查詢與解析結果、快取、日誌；清空快取                                                   |
| 策略       | 群組、成員與健康；選擇、手動固定、恢復自動選擇、測試、編輯                             |
| 規則       | 從規則或設備經出站到所選節點的分流樹、規則列表與命中數、流程記錄、對指定目標的追蹤模擬 |
| 節點       | 訂閱與更新間隔、組態內節點、新增與移除、測試、加入群組                                 |
| 組態       | 來源與診斷、附校驗的編輯器、快速設定、匯出                                             |
| 事件、日誌 | 後端事件串流；日誌串流，可篩選、暫停、匯出                                             |
| 設定       | 後端、執行期設定與後端操作、語言、外觀與配色                                           |

只有頁面需要的資源全部不可用時，頁面才會標為不可用。任何頁面按 `Ctrl K` 可搜尋頁面、連線、節點、群組、規則與來源。各頁面需要的資源與 doona 自身設定的存放位置，見[使用指南](docs/guide.zh-TW.md#頁面)。

<img src="docs/screenshots/zh-TW/rules-light.webp" alt="規則頁" width="100%">

## 開發

```sh
pnpm install --frozen-lockfile
pnpm build                       # 輸出 dist/
pnpm check                       # 型別、lint、翻譯、格式、單元測試、產生的 API 型別
pnpm check:size                  # dist/ 建置的 gzip 大小限制
pnpm e2e:install --with-deps     # 瀏覽器測試只需安裝一次
pnpm e2e                         # 重新建置，再對模擬後端執行瀏覽器測試，涵蓋根目錄與 /ui/
pnpm package                     # release/doona-<version>.tar.gz、doona-fonts-<version>.tar.gz、SHA256SUMS
```

`pnpm dev` 以 Vite 開發伺服器提供模擬後端。對實際後端的測試、效能與截圖工具、原始碼配置與契約釘點，見[使用指南](docs/guide.zh-TW.md#開發)；送出 pull request 前先讀 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 支援

問題與提問請到 [issues](https://github.com/Zakkaus/doona/issues)。後端問題請提交到所連接引擎的專案：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。

## 授權與致謝

[GPL-3.0-only](LICENSE)。Noto Sans TC 與 SC 採 [Open Font License](public/fonts/OFL.txt)；[NOTICE](NOTICE) 註明 Adobe Spectrum 圖示（Apache-2.0）。鴨子是維護者自己畫的。
