# 頁面與導覽

[English](pages.md) / [简体中文](pages.zh-CN.md) / 繁體中文

標準版將頁面分為四個導覽分區。頁面操作與手機導覽見[介面導覽](https://doona.daeuniverse.org/zh-TW/tour.html)，各項控制項的使用方法見[觀測指南](https://doona.daeuniverse.org/zh-TW/observe.html)、[路由指南](https://doona.daeuniverse.org/zh-TW/routing.html)與[組態指南](https://doona.daeuniverse.org/zh-TW/config-and-settings.html)。

## 原始碼索引

| 原始碼                                                                | 職責                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| [src/shell/routes.ts](../src/shell/routes.ts)                         | 路由識別碼、預設路由、導覽分區與 `PageProps`           |
| [src/shell/registry.ts](../src/shell/registry.ts)                     | 頁面載入器、導覽標籤、圖示、快捷鍵、載入佔位與資源需求 |
| [src/features/](../src/features/)                                     | 功能頁面及其狀態 Hook                                  |
| [src/shell/widgets/Dashboard.tsx](../src/shell/widgets/Dashboard.tsx) | 活動頁                                                 |
| [src/shell/SideNav.tsx](../src/shell/SideNav.tsx)                     | 導覽呈現                                               |
| [src/shell/search/](../src/shell/search/)                             | 全域搜尋                                               |
| [src/i18n/locales/](../src/i18n/locales/)                             | 登錄表引用的翻譯標籤                                   |

## 導覽分區

下表標籤與繁體中文語言目錄一致。各語言使用相同的路由與分區 ID，順序由 [routes.ts](../src/shell/routes.ts) 定義。

| 標籤 | 分區 ID    | 路由 ID                                         |
| ---- | ---------- | ----------------------------------------------- |
| 活動 | `activity` | `activity`, `overview`                          |
| 觀測 | `traffic`  | `connections`, `flows`, `dns`, `logs`, `events` |
| 路由 | `routing`  | `policies`, `nodes`, `rules`                    |
| 設定 | `settings` | `config`, `settings`                            |

## 操作補充

以下內容補充連結指南中尚未說明的控制項與限制。

### 登入與節點詳細資料

示範版預先填入使用者名稱 `demo` 與密碼 `demo`。

節點詳細資料中的群組連結會開啟策略頁對應的群組卡片。後端回報多種探測結果時，展開節點列可查看最新的 TCP、HTTP、UDP 或 DNS 結果，包括各項延遲或失敗原因。逐節點國旗操作見[更換節點國旗](country-flags.md#change-a-nodes-flag)。

### XHTTP 節點選項

在貼上節點連結或編輯…中輸入支援的 VLESS 或 Trojan XHTTP 連結後，XHTTP 選項會顯示模式、路徑、主機、標頭、填充、POST 節奏與獨立下載端等欄位。儲存的值仍是連結，欄位修改會寫入對應查詢參數或 `extra` JSON 成員。無法用這些欄位表示的連結仍可直接編輯原始文字。

未修改的查詢參數字串會保留。修改 `extra` 會重新序列化物件、正規化空白，並使用 JavaScript 的數字精度。標頭名稱會去除首尾空白；重複名稱不區分大小寫，必須更正後才能儲存。未完成的標頭列也算未儲存變更；替換原始連結會替換這些列。

連結有變更且後端提供語法驗證時，doona 會在寫入前要求 honk 單獨解析該連結。連結被拒絕時，會顯示翻譯後的診斷及後端提供的詳細資訊。8,192 字元限制只適用於新增節點；更長的現有宣告可在此處或組態頁編輯。

連結驗證與儲存共用一個交易，因此群組與路由模式的編輯必須等待該交易完成，即使節點對話框已經關閉。欄位對應見 [xhttp.ts](../src/dae/xhttp.ts)，儲存流程見 [useNodesPage.ts](../src/features/nodes/useNodesPage.ts)。

### 觀測圖表與清單

- 連線頁的流量分頁按出站著色，繪製各連線的上傳量與下載量。清單分頁可按裝置或出站分組、按協定與出站篩選，並展開或摺疊各群組。
- DNS 的統計分頁顯示解析時間中位數、P95、快取命中率與失敗率。圖表將各上游的查詢放在延遲刻度上，並統計查詢結果。
- 日誌清單上方的熱圖按時間統計各等級的記錄數。選擇等級的列標題可設定清單顯示的最低等級。選擇日誌列可在表格下方閱讀完整文字。
- 路由圖展示流量從規則或裝置經出站到節點的路徑。指向或選擇規則、出站或節點可突顯其路徑。

### 小工具與手機版面

在編輯小工具中，支援這些顯示方式的速率與計數小工具可選擇迷你折線圖或鍵值清單。將指標停留於速度摘要、使其取得焦點或輕點摘要，即可展開隱藏在螢幕邊緣的面板。

寬度小於 600 px 時，表格保留所有欄並支援橫向捲動。更寬的版面會按優先順序隱藏放不下的欄。工具列會換行。

### 安裝為應用程式

要讓瀏覽器提供 PWA 安裝，請透過 HTTPS、`localhost` 或 `127.0.0.1` 存取 doona；詳見[安裝條件](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable#https_localhost_or_loopback_are_required)。安裝可用時，Chrome 與 Edge 會在設定 > 關於中提供安裝為應用程式。

iPhone 與 iPad Safari 中，選擇分享 > 加入主畫面。macOS Sonoma 或更高版本中，在 Safari 選擇檔案 > 加入 Dock 中。doona 僅在 Safari 26 或更高版本顯示這項 macOS 提示，判斷邏輯見 [install.ts](../src/shell/install.ts)。

## 修改頁面

1. 新增頁面時，在 `routePaths` 中加入路由，將其分配到導覽分區，並在 `registry.ts` 中加入定義。登錄表的型別要求涵蓋每個 `RoutePath`。
2. 導覽文字放在語言目錄中。頁面載入器、載入佔位與所需資源在登錄表中定義。
3. 導覽可用性規則由 `navAvailable` 處理。有資源需求的頁面，只要至少一項所需資源未被明確標為無法使用，即視為可用。組態頁還檢查匯出、匯入與修訂版本功能。
4. 行為變更時更新對應的使用指南。使用者操作步驟放在文件站，本頁保留原始碼索引。操作補充須等指南承接內容且本頁提供對應連結後才能刪除。

[registry.test.ts](../src/shell/registry.test.ts) 與 [navGroups.test.ts](../src/shell/navGroups.test.ts) 涵蓋登錄表與導覽分區摺疊狀態的儲存。倉庫檢查要求見 [CONTRIBUTING.md](../CONTRIBUTING.md)。本頁的原始碼索引適用於標準版；lite 應用程式的原始碼獨立放在 [apps/lite/](../apps/lite/)。
