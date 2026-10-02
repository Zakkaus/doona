<div align="center">

<img src="public/logo.svg" width="104" alt="doona">

# doona

**[daeuniverse](https://github.com/daeuniverse) 引擎的 Web 介面：在瀏覽器中管理節點、群組、規則與組態。**

**[線上示範](https://demo.daeuniverse.org/)** / **[文件](https://zakkaus.github.io/doona-docs/zh-TW/)**

[English](README.md) / [简体中文](README.zh-CN.md) / 繁體中文

[安裝](#安裝) / [頁面](#頁面) / [頁面導覽](#頁面導覽) / [手機版面](#手機版面) / [開發](#開發)

</div>

doona 是 daeuniverse 引擎共用原生 API 的靜態 Web 介面：現在是 honk，dae 實作同一份契約後亦可。它由引擎自己或任一 Web 伺服器提供，顯示引擎當下的狀態，並管理節點、群組、路由規則與組態檔。

[使用範例資料體驗示範版](https://demo.daeuniverse.org/)。以 [`?scenario=faults`](https://demo.daeuniverse.org/?scenario=faults) 開啟示範版可檢視錯誤狀態，以 `?scenario=` 開啟則恢復正常的示範版。

![活動頁](https://zakkaus.github.io/doona-docs/screenshots/zh-TW/activity-light.webp)

<details>
<summary><strong>全部配色</strong></summary>

十二套配色各有淺色與深色。Rosé Pine 有兩種，Catppuccin 有三種；其餘七種為 Nord、Kary Pro Colors、Ant Design、Arco Design、Semi Design、玻璃與中國（白班／夜班）。中國配色將良好與運作中顯示為穩中向好，將無法使用與降級顯示為嚴峻挑戰。可在頂欄切換配色，或透過登入頁的外觀按鈕開啟設定頁的外觀區域。

<img src="https://zakkaus.github.io/doona-docs/screenshots/palettes.webp" alt="全部配色的淺色與深色" width="100%">

</details>

## 配色範例

下圖展示活動頁的五種配色。可在頂欄切換配色和模式。

| 配色       | 淺色                                                                                                | 深色                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Rosé Pine  | ![Rosé Pine 淺色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-rose-pine-light.webp)   | ![Rosé Pine 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-rose-pine-dark.webp)   |
| Catppuccin | ![Catppuccin 淺色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-catppuccin-light.webp) | ![Catppuccin 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-catppuccin-dark.webp) |
| Nord       | ![Nord 淺色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-nord-light.webp)             | ![Nord 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-nord-dark.webp)             |
| Glass      | ![Glass 淺色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-glass-light.webp)           | ![Glass 深色](https://zakkaus.github.io/doona-docs/screenshots/en/theme-glass-dark.webp)           |
| 中國       | ![中國白班](https://zakkaus.github.io/doona-docs/screenshots/en/theme-qiangguo-light.webp)          | ![中國夜班](https://zakkaus.github.io/doona-docs/screenshots/en/theme-qiangguo-dark.webp)          |

## 狀態

doona 對接 honk `feat/native-api` 分支實作的原生 API；這套 API 尚未發行。契約的釘點記錄在 [SOURCE.md](contract/api-standardize/SOURCE.md)。後端缺少較新的資源鍵時，doona 會把這些鍵視為不可用。未設定後端時，內建模擬後端提供示範資料；本文截圖全部來自模擬資料。

## 安裝

doona 需要 honk 的原生 API，目前只有 [Glassyiris/honk `feat/native-api`](https://github.com/Glassyiris/honk/tree/feat/native-api) 分支的 `debug` 版本提供。發行檔（`doona-<version>.tar.gz`、選用的 `doona-fonts-<version>.tar.gz`（Noto Sans TC 與 SC）、`SHA256SUMS`）附在[發布頁](https://github.com/Zakkaus/doona/releases)的標籤上。將 `doona-<version>.tar.gz` 解壓縮到 honk `native_api` 組態區塊中 `ui` 指定的目錄，honk 即在 `/ui/` 提供 doona。

自 v0.1.0-beta.8 起，在 honk 發行含原生 API 的正式版本之前，每個 doona 發行版也附上預先建置的 `honk-core-debug-<target>[-stock].tar.gz`，使用者不需自行編譯 honk。封存檔包含 honk 原生 API 分支的 debug 建置，實作最終的原生 API 契約。`HONK-SOURCE.txt` 註明建置所用的 honk 提交，`honk-source-<commit>.tar.gz` 為該提交的原始碼，`SHA256SUMS` 涵蓋除自身以外的所有發布附件。[安裝 honk](https://zakkaus.github.io/doona-docs/zh-TW/install.html#install) 說明如何依閘道器選擇封存檔。

[文件](https://zakkaus.github.io/doona-docs/zh-TW/)涵蓋系統需求、honk 與 doona 的安裝、範例組態、首次登入、逐項檢查功能與疑難排解。

## 頁面

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/policies-light.webp" alt="策略頁" width="100%">

| 頁面       | 內容                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 活動       | 出站模式、流量、記憶體與程序 CPU 使用率、活動連線、節點延遲、出站用量、流量最高的客戶端、通知                                   |
| 系統狀態   | 引擎與 eBPF 狀態、程序 CPU 使用率、流量計數、執行期降級、後端能力與未開啟的功能、狀態 JSON 匯出                                 |
| 連線       | 即時連線的來源、目的、命中規則、鏈及其來源、流量與傳輸速率；修改可寫入規則的出站；收合分組，關閉單條或全部                      |
| 分流       | 分流總覽與流程記錄                                                                                                              |
| DNS        | 查詢與解析結果、快取、解析記錄與統計；組態可寫入時依記錄中的網域新增 DNS 規則；選擇查詢上游；支援時刪除符合條件的項目或清空快取 |
| 策略       | 群組、成員與健康；選擇、手動固定、測試、編輯、健康檢查網址，以及可修改的容忍差值與閒置逾時                                      |
| 規則       | 路由規則與 DNS 請求及回答規則，可在可寫入來源中編輯；簡易檢視中的模板設定；命中數與追蹤模擬                                     |
| 節點       | 訂閱與更新間隔、組態內節點、新增與移除、測試、依類型檢視探測結果、加入群組                                                      |
| 組態       | 新增來源檔案並直接編輯、診斷、驗證、目前組態版本、來源檔案匯出                                                                  |
| 事件、日誌 | 後端事件串流；日誌串流，可篩選、暫停、匯出                                                                                      |
| 設定       | 後端、執行期設定與操作、地理資料來源、恢復預設值與支援時的 SHA-256 驗證、語言、外觀、配色與通知位置                             |

只有頁面需要的資源全部不可用時，頁面才會標為不可用。後端列出 DNS 規則時才顯示對應分頁；編輯須有可寫入的來源檔案。連線、分流與規則頁開啟期間會請求流程，無須將流程記錄設為常開。

任何頁面按 `Ctrl K` 可搜尋頁面、連線、節點、群組、規則與來源。各頁面需要的資源與 doona 自身設定的存放位置，見[功能](https://zakkaus.github.io/doona-docs/zh-TW/features.html#pages)一頁。不易理解的狀態與術語旁設有說明按鈕，按下即顯示說明。

登入為獨立頁面，外觀按鈕會開啟設定頁的外觀區域，可在其中設定語言、配色與主題。視窗寬度不小於 1024 像素時，表單旁的面板顯示施工場景，按下後啟動 Flappy Duck 小遊戲。示範版預先填入使用者名稱 `demo` 與密碼 `demo`。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/rules-light.webp" alt="規則頁" width="100%">

## 頁面導覽

### 群組成員

在策略頁按群組卡片的鉛筆按鈕，即可編輯策略及選入的地區、訂閱與節點。對話框顯示符合條件的節點，儲存前可復原變更。新增群組使用同一個編輯器。節點頁的群組連結會跳轉到群組卡片；節點操作選單中，加入群組列出可寫入主檔案與包含檔案中的群組；選擇後開啟編輯器，暫存選取的節點，待確認後儲存。在包含檔案中宣告的節點與訂閱不能從此頁移除，停用的操作會說明原因。

### 流量與連線

連線頁的流量分頁以散佈圖呈現每條連線的上傳量與下載量，並依出站著色；選取資料點即可開啟對應的連線。連線分頁依裝置或出站將即時連線分組，可依協定與出站篩選，並匯出為 CSV。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/connections-traffic.webp" alt="連線頁的流量分頁" width="100%">

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/connections-list.webp" alt="依裝置分組的即時連線" width="100%">

### DNS

統計分頁顯示解析時間的中位數與 P95、快取命中率、失敗率、各上游在延遲刻度上的查詢分布，以及查詢的結果分類。後端提供 DNS 規則且組態可寫入時，可從解析記錄為其網域新增 DNS 請求規則，預設條件精確比對網域；要包含子網域，須選擇後綴條件。

查詢分頁的自動選項遵循 `dns.routing`；組態可讀取時，也可選擇 `dns.upstream` 中定義的上游。後端支援刪除時，快取分頁可依全名、後綴、關鍵字或正規表示式、記錄類型，或兩者的組合刪除記錄，確認前會顯示符合條件的數量。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/dns.webp" alt="DNS 頁的統計分頁" width="100%">

### 日誌時間分布

日誌列表上方的熱圖按時間統計各級別的記錄數。點選級別的列標題，即可設定列表顯示的最低級別。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/logs.webp" alt="日誌時間分布熱圖" width="100%">

### 分流總覽

分流頁的分流總覽依規則或裝置，經出站追蹤到節點。將指標移到規則、出站或節點上，或選取其中一項，即可標示經過該項的路徑。規則頁追蹤模擬的進階欄位接受可選的 DSCP 整數，範圍為 0 至 63，用於評估 `dscp(...)` 規則。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/routing.webp" alt="在分流總覽中依序選取規則與節點" width="100%">

### 節點延遲

節點頁的延遲分頁依策略群組或協定分組，顯示每個節點的目前延遲；後端提供時，另顯示移動平均與近 10 次平均。無法使用的節點列在所屬群組下方。在節點分頁開啟節點列，可檢視後端回報的各類探測最新結果，包括 TCP、HTTP、UDP 與 DNS，每項顯示延遲或失敗原因。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/latency.webp" alt="節點頁的延遲分頁" width="100%">

### 組態與設定

組態頁顯示目前生效的組態版本。模組分頁為每個組態區塊顯示一行摘要，並連結到管理該區塊的頁面。後端支援時，全域設定編輯引擎的持久設定；設定檔分頁編輯選取的可寫入來源，並匯出顯示的內容，匯出檔案可能包含憑證。若寫入涉及必須重新啟動才能生效的設定，則整次寫入遭拒；提示會列出設定，並提供重新啟動指令及安裝指南連結。

設定頁的地理資料卡片提供重設為預設值，確認後移除所有地理資料覆寫及取自組態檔的值，恢復內建來源與預設值。錯誤通知與操作結果未知的提示提供複製錯誤；設定頁的關於卡片可複製記憶體中保留的最近 20 條錯誤，不含密鑰與請求內文。

### 小工具

浮動小工具面板的選單提供編輯小工具，適用的速率與數量小工具可選擇迷你折線圖或鍵值清單。未固定且未停靠的面板提供收至邊緣；將指標移到速度摘要上、聚焦或點選摘要即可展開。未固定的浮動面板在切換頁面時收合。

## 手機版面

視窗寬度小於 1024 像素時，側邊導覽改為底部列，分為活動、流量、路由與設定四組。每組開啟時顯示本次工作階段最後瀏覽的頁面，組內各頁排成一列，位於內容上方。語言、主題與配色移入頂欄的溢位選單，各為一個子選單。字標在設定頁的外觀區域選擇。

視窗寬度小於 600 像素時，表格保留所有欄位並可橫向捲動；更寬時依預設順序隱藏放不下的欄位。工具列換行排列。在事件與日誌頁，按下某一列即可在表格下方閱讀完整文字。在系統狀態、DNS 與日誌頁，第一個操作保留為按鈕，其餘收進選單。

透過 HTTPS 或在 localhost 上開啟時，doona 可安裝為應用程式。在 Chrome 與 Edge 中，設定頁的關於卡片提供安裝為應用程式按鈕。Safari 沒有安裝提示，因此卡片改為顯示操作步驟：iPhone 與 iPad 上點一下分享，再點一下加入主畫面；macOS 上的 Safari 26 選擇檔案 > 加入 Dock 中。

<img src="https://zakkaus.github.io/doona-docs/screenshots/zh-TW/phone.webp" alt="手機上的 doona：連線表格、溢位選單及其配色子選單" width="100%">

## 開發

建置、測試與打包指令、原始碼配置與契約釘點，見[開發](https://zakkaus.github.io/doona-docs/zh-TW/development.html)一頁；送出 pull request 前先讀 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 支援

問題與提問請到 [issues](https://github.com/Zakkaus/doona/issues)。後端問題請提交到所連接引擎的專案：[honk](https://github.com/daeuniverse/honk) 或 [dae](https://github.com/daeuniverse/dae)。通報安全漏洞的方式見 [SECURITY.md](.github/SECURITY.md)。

## 授權與致謝

[GPL-3.0-only](LICENSE)。[Noto Sans TC 與 SC](docs/fonts.md) 由 Fontsource npm 套件提供，版權歸 Adobe 所有，採用 [Open Font License](LICENSES/OFL-1.1.txt)；[NOTICE](NOTICE) 註明 Adobe Spectrum 圖示（Apache-2.0）。鴨子是維護者自己畫的。
