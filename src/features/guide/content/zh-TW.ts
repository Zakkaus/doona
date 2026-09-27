import type {GuideContent} from '../types';
import * as s from '../snippets';

// Sources are cited beside each fact in en.ts; this file states the same facts.
export const content: GuideContent = {
  interimTitle: '暫行指南',
  interim: `doona 需要 honk 的原生 API。此 API 目前只存在於 Glassyiris/honk 的 \`feat/native-api\` 分支及其持續更新的 \`debug\` 版本。本指南已對照 \`${s.honkBuild.release}\`（提交 \`${s.honkBuild.commit}\`）核對。上游 honk 正式發布此 API 之前，組態鍵與預設值仍可能變更。`,
  sections: [
    {
      id: 'requirements',
      title: '系統需求',
      blocks: [
        {
          kind: 'p',
          text: 'honk 只能在 Linux 上以 `root` 身分執行。它會載入 eBPF 程式、建立 `dae0` 連結與 `daens` 命名空間並修改 sysctl，因此首次啟動時請保留主控台等第二條管理途徑。'
        },
        {
          kind: 'list',
          items: [
            'Linux 6.12 或更新版本。核心版本過舊時，honk 會在掛載任何程式之前拒絕啟動。',
            '下列核心選項。桌面與伺服器發行版通常已啟用；OpenWrt、Armbian 與 VyOS 需要逐項檢查。',
            '`pname(...)` 規則需要 cgroup v2。缺少 cgroup v2 時 honk 仍可啟動，但依程序名稱分流無法使用。',
            'bpffs 掛載於 `/sys/fs/bpf`。'
          ]
        },
        {kind: 'code', lang: 'sh', text: s.kernelCheck},
        {kind: 'code', lang: 'text', text: s.kernelOptions},
        {kind: 'p', text: '系統未自動掛載 bpffs 時，請執行：'},
        {kind: 'code', lang: 'sh', text: s.bpffs},
        {kind: 'h', text: 'honk 版本'},
        {
          kind: 'list',
          items: [
            `只有 Glassyiris/honk \`feat/native-api\` 分支的建置提供原生 API，也就是持續更新的 \`debug\` 版本，目前由標籤 \`${s.honkBuild.release}\`（提交 \`${s.honkBuild.commit}\`）建置。`,
            '由 main 分支建置的版本（例如 `debug.2026.9.24.1`）沒有原生 API。honk 會以 `unknown experimental setting` 拒絕所有 `native_api` 設定，存取 `/api` 與 `/ui/` 會回傳 404。',
            `地理資料來源設定需要 \`${s.honkBuild.geodataSources}\` 或更新版本。\`debug.2026.9.24.native-api.*\` 可以更新地理資料，但無法設定來源。`
          ]
        },
        {kind: 'p', text: '執行 `honk-core --version` 可查看執行中的版本。doona 也會在概覽頁的「引擎」卡片與側邊導覽列底部顯示此版本。'}
      ]
    },
    {
      id: 'install',
      title: '安裝 honk',
      blocks: [
        {kind: 'p', text: '請從 Glassyiris/honk 的 `debug` 版本下載 honk。其他建置沒有原生 API，詳見「系統需求」中的「honk 版本」。'},
        {
          kind: 'links',
          items: [
            {href: s.links.honkRelease, text: 'Glassyiris/honk debug 版本'},
            {href: s.links.honkDocs, text: 'honk 快速入門'}
          ]
        },
        {
          kind: 'table',
          head: ['檔案', '用途'],
          rows: [
            ['`honk-core-debug-x86_64-unknown-linux-musl.tar.gz`、`…-aarch64-unknown-linux-musl.tar.gz`', '靜態連結，適用於閘道器。無法確定時請選擇此項。'],
            ['`…-unknown-linux-gnu.tar.gz`', '連結 glibc，適用於一般發行版。'],
            ['`-stock` 後綴', '使用系統記憶體配置器而非 mimalloc，適用於較重視記憶體用量的小型裝置。']
          ]
        },
        {kind: 'code', lang: 'sh', text: s.installHonk},
        {kind: 'p', text: '執行檔已內建 eBPF 物件，不需另外安裝其他元件。'},
        {kind: 'h', text: '目錄與地理資料'},
        {
          kind: 'p',
          text: '建立組態目錄與資料目錄，再下載範例規則使用的 geosite 與 geoip 檔案。honk 會在 `data_dir` 中尋找這兩個檔案；它們也是 honk 更新地理資料時下載的檔案。'
        },
        {kind: 'code', lang: 'sh', text: s.prepareDirs},
        {kind: 'h', text: 'systemd 服務'},
        {kind: 'p', text: '發布套件不含 systemd 單元。請建立 `/etc/systemd/system/honk-core.service`：'},
        {kind: 'code', lang: 'ini', text: s.systemdUnit},
        {
          kind: 'p',
          text: '此時請勿啟動服務。範例組態從 `/usr/share/doona` 提供 doona，該目錄沒有 `index.html` 時 honk 會拒絕啟動；啟動步驟位於「安裝 doona 並啟動」一節。'
        },
        {
          kind: 'p',
          text: '請勿加入 `NoNewPrivileges=yes`、能力邊界限制或唯讀 `/proc/sys`，因為啟動過程需要 BPF、網路管理、命名空間、掛載與 sysctl 權限。'
        }
      ]
    },
    {
      id: 'config',
      title: '範例組態',
      blocks: [
        {
          kind: 'p',
          text: '組態分為兩個檔案。主檔案 `/etc/honk/config.dae` 包含網路介面、節點、群組、分流與 DNS；`/etc/honk/config.d/api.dae` 包含 doona 使用的原生 API。主檔案引入 `config.d/` 中的所有 `.dae` 檔案，相對路徑以主檔案所在目錄為基準。'
        },
        {kind: 'h', text: '主檔案'},
        {kind: 'code', lang: 'dae', text: s.mainConfig},
        {
          kind: 'list',
          items: [
            '`lan_interface`：區域網路用戶端連到閘道器所用的網路介面。`wan_interface: auto` 同時處理閘道器本身的流量。',
            '`data_dir`：執行期根目錄，預設為 `/var/lib/honk`，存放地理資料檔案與狀態資料庫 `state/honk.db`。',
            '`bootstrap_resolver`：直接解析代理伺服器與地理資料下載位址的網域名稱，避免被 honk 攔截。下載網址使用網域名稱時必須設定此項。',
            '`subscription` 與 `node`：請換成自己的訂閱與節點。之後可在 doona 的節點頁繼續新增。',
            '`group proxy`：包含訂閱中的節點與靜態節點；`min_moving_avg` 選擇延遲最低的成員。',
            '`routing`：私有位址優先以 `direct(must)` 直連，中國大陸網域與 IP 位址直連，其餘流量經由 `proxy`。',
            '`dns`：中國大陸網域交給本地解析器，其餘經由代理以 DNS over HTTPS 解析。'
          ]
        },
        {kind: 'h', text: 'API 檔案'},
        {kind: 'code', lang: 'dae', text: s.apiConfig},
        {
          kind: 'p',
          text: '請將 `192.168.1.1` 換成閘道器的區域網路位址，並將此組態區塊單獨放在一個檔案。檔案在 `native_api` 或 `clash_api` 中包含 `secret`，或包含與 8 個字元以上監聽密鑰相同的文字時，doona 會將該檔案顯示為唯讀，因為 honk 會隱藏密鑰，寫回檔案會遺失密鑰。該檔案中宣告的群組同樣變為唯讀。'
        },
        {kind: 'p', text: '新增節點與訂閱會寫入主檔案，因此主檔案不能包含任何密鑰。'},
        {kind: 'p', text: '從其他來源開啟 doona 時，例如經由 TLS 反向代理，還需加入：'},
        {kind: 'code', lang: 'dae', text: s.apiOptional},
        {
          kind: 'table',
          head: ['欄位', '預設值', '在 doona 中啟用的功能'],
          rows: [
            ['`enabled`', '`false`', 'API 監聽，也就是 doona 的所有功能。'],
            ['`listen`', "`'127.0.0.1:9527'`", 'doona 連線的位址，只接受數字 IP 與連接埠。預設值只能從閘道器本機存取。'],
            ['`password_auth`', '`false`', '以管理員使用者名稱與密碼登入，不能與 `secret` 同時使用。'],
            ['`secret`', "`''`", 'Token 模式，doona 會要求輸入此 Token。不能與 `password_auth` 同時使用。'],
            ['`config_write`', '`false`', '編輯與新增組態檔案，管理節點、訂閱、群組與規則，以及更新地理資料。需要 `password_auth` 或 `secret`。'],
            ['`ui`', "`''`", '在 `/ui/` 提供 doona。目錄中必須有 `index.html`；目錄不存在時 honk 無法啟動。'],
            ['`record_flows`', '`true`', '規則頁的流程記錄。設為 `false` 時，執行期開關也無法開啟。'],
            ['`record_traffic`', '`true`', '流量歷史圖表。'],
            ['`record_memory`', '`true`', '記憶體歷史圖表。'],
            ['`record_logs`', '`true`', '日誌頁。'],
            ['`record_dns_log`', '`true`', 'DNS 記錄。'],
            ['`geosite_download_url`、`geoip_download_url`', "`''`", '沒有狀態資料庫時的地理資料更新。有狀態資料庫時，啟動時以這兩個網址覆寫已儲存的網址。'],
            ['`allow_origins`、`allowed_hosts`', '空', '從其他來源或經由反向代理開啟 doona。']
          ]
        },
        {kind: 'p', text: '`native_api` 的每個欄位都需要重新啟動才會生效。重載會拒絕這些欄位的變更，並保留執行中的監聽。'},
        {kind: 'h', text: '安裝組態檔案'},
        {kind: 'code', lang: 'sh', text: s.installConfig},
        {kind: 'p', text: '接著安裝 doona，之後再啟動 honk。'}
      ]
    },
    {
      id: 'doona',
      title: '安裝 doona 並啟動',
      blocks: [
        {
          kind: 'p',
          text: '下載 doona 發布套件並解壓縮到 `/usr/share/doona`，也就是 `ui` 指定的目錄。最後一個指令必須列出 `index.html`，否則 honk 無法啟動。'
        },
        {kind: 'links', items: [{href: s.links.doonaReleases, text: 'doona 發布頁'}]},
        {kind: 'code', lang: 'sh', text: s.installDoona},
        {kind: 'p', text: 'honk 每次請求都從磁碟讀取這些檔案，因此日後替換檔案不需重新啟動。'},
        {kind: 'h', text: '啟動 honk'},
        {kind: 'p', text: '啟用並啟動服務，再查看日誌：'},
        {kind: 'code', lang: 'sh', text: s.startHonk},
        {kind: 'p', text: '日誌出現 `honk-core is running` 即表示啟動完成。'},
        {kind: 'h', text: '狀態資料庫'},
        {
          kind: 'p',
          text: 'honk 預設會開啟 `<data_dir>/state/honk.db`：`global.store_subscribe` 預設為開啟，本範例也啟用了 `native_api`。狀態資料庫沒有需要加入的開關。此資料庫儲存管理員帳號、地理資料來源，以及 honk 需要持久保存的其他狀態。honk 會自行建立 `state/` 與 `honk.db`；`/var/lib/honk` 必須存在且 root 可寫入。'
        },
        {
          kind: 'p',
          text: '本範例設定了 `password_auth: true`，資料庫無法開啟時 honk 不會啟動，因此 honk 正在執行即代表資料庫已開啟。Token 模式下 honk 不使用資料庫也會啟動，並記錄一則警告；此時缺少狀態資料庫代表它未能開啟。日誌訊息的意義請參閱「疑難排解」中的「狀態資料庫問題」。'
        },
        {kind: 'h', text: '首次登入'},
        {
          kind: 'list',
          ordered: true,
          items: [
            '開啟 `http://192.168.1.1:9527/ui/`，也就是 `listen` 位址。doona 會在同一來源找到 API，並將其儲存為後端。',
            '密碼模式：登入對話框提供首次設定。請在閘道器本機或區域網路裝置上建立管理員，再登入。',
            'Token 模式：輸入 `secret` 作為 Token，或開啟配對連結。doona 載入後會從網址列移除 Token。'
          ]
        },
        {kind: 'code', lang: 'text', text: s.pairingLink},
        {kind: 'p', text: '忘記管理員密碼時，請先停止 honk，再執行 `sudo honk-core admin reset`；下次啟動時會重新進入首次設定。'},
        {kind: 'h', text: '從其他來源開啟 doona'},
        {
          kind: 'p',
          text: 'doona 由其他伺服器提供時，瀏覽器會送出跨網域請求，honk 只接受 `allow_origins` 列出的來源與 `allowed_hosts` 列出的主機。請在設定中填寫伺服器根網址，例如 `http://192.168.1.1:9527`，不要附加 `/api/v1`。'
        },
        {
          kind: 'p',
          text: '透過 HTTPS 載入的頁面無法存取純 HTTP 的 API，瀏覽器會將其視為混合內容並封鎖。請從 honk 的 `/ui/` 開啟 doona，或將 honk 置於 TLS 反向代理之後。'
        }
      ]
    },
    {
      id: 'features',
      title: '逐項檢查功能',
      blocks: [
        {
          kind: 'p',
          text: '請先確認閘道器能轉送流量。將範例訂閱與節點換成可用的訂閱與節點，再從實際的區域網路用戶端分別測試直連與代理的 TCP、UDP 及 DNS。`honk-core is running`、`dae0` 連結或可存取的 API 都無法證明流量正常。'
        },
        {kind: 'p', text: '使用範例組態時，doona 的所有功能皆可使用。請依下表逐項確認。'},
        {
          kind: 'table',
          head: ['功能', '正常時的表現', '依賴的組態'],
          rows: [
            ['登入與所有頁面', '登入後，活動頁顯示流量與連線。', '`enabled: true`，以及 `password_auth: true` 或 `secret`'],
            ['組態：編輯檔案', '來源清單中的每個檔案開啟後都沒有唯讀標記，套用後會驗證並重載。', '`config_write: true`；檔案不含密鑰'],
            ['組態：新增檔案', '「新增檔案」會建立由主檔案 `include` 模式引入的 `.dae` 檔案，例如 `config.d/rules.dae`。', '`config_write: true`'],
            ['策略：編輯群組', '群組卡片提供「編輯」，儲存後生效。', '`config_write: true`；群組所在檔案不含密鑰'],
            ['節點：新增節點與訂閱', '節點頁提供「貼上節點連結」與「新增訂閱」。', '`config_write: true`；主檔案不含密鑰'],
            ['節點：重新整理訂閱', '每個訂閱列都有「重新整理」。', '存在 `subscription` 項目，且 honk 的訂閱服務正在執行'],
            [
              '設定：地理資料來源與更新',
              '地理資料卡片列出來源，「更新」按鈕可用。',
              `honk \`${s.honkBuild.geodataSources}\` 或更新版本；狀態資料庫；\`config_write: true\`；下載網址；\`bootstrap_resolver\``
            ],
            ['設定：後端選項', '後端選項卡片提供流程記錄、日誌記錄與 DNS 記錄開關。', '`record_flows`、`record_logs`、`record_dns_log`'],
            ['活動：流量與記憶體歷史', '歷史圖表在最多 10 分鐘內逐步填滿。', '`record_traffic`、`record_memory`'],
            ['日誌', '開啟日誌頁時持續出現日誌。', '`record_logs`'],
            ['DNS：查詢、快取與記錄', '列出查詢與快取；開啟頁面時記錄持續增加。', '記錄需要 `record_dns_log`；`dns` 組態區段'],
            ['連線：關閉', '可以逐筆關閉連線，也可以全部關閉。', '`enabled: true`'],
            [
              '規則：規則清單、流程記錄與追蹤模擬',
              '規則顯示命中次數，出現流程記錄，「追蹤模擬」可說明指定目標。',
              '流程記錄需要 `record_flows`；`routing` 組態區段'
            ],
            ['延遲測試', '節點的「測試」與群組的「測試全部」顯示延遲。', '`enabled: true`；私有位址目標另需 `probe_allowed_cidrs`'],
            ['事件', '事件頁顯示事件串流。', '`enabled: true`']
          ]
        },
        {kind: 'p', text: '在預設的「隨面板」模式下，流程記錄依需求進行，日誌記錄與 DNS 記錄只在有面板連線時進行。已允許但處於閒置狀態的記錄器屬於正常情況。'},
        {kind: 'h', text: '仍有功能缺少時', id: 'still-missing'},
        {
          kind: 'list',
          items: [
            '變更 `native_api` 後沒有重新啟動 honk。重載不會套用這些欄位。',
            '缺少 `config_write: true`。`native_api` 的欄位直接寫在 `experimental` 下時，honk 會以 `unknown experimental setting` 拒絕啟動。',
            '既沒有 `password_auth: true`，也沒有 `secret`。此時若設定了 `config_write: true`，honk 會拒絕啟動。',
            '檔案包含密鑰或與密鑰相同的文字，因此 doona 將其顯示為唯讀。',
            `honk 早於 \`${s.honkBuild.geodataSources}\`，因此地理資料卡片沒有來源設定。`,
            'Token 模式下狀態資料庫未能開啟，因此地理資料來源卡片被隱藏。',
            '僅在以 `--store db` 執行時出現，本指南不使用此模式：honk 未能記錄的修訂會阻止後續寫入，直到下一次成功啟用組態。'
          ]
        },
        {
          kind: 'links',
          items: [
            {href: '#/guide?section=read-only', text: '唯讀的組態檔案'},
            {href: '#/guide?section=state-db', text: '狀態資料庫問題'},
            {href: '#/guide?section=unknown-setting', text: 'unknown experimental setting'}
          ]
        }
      ]
    },
    {
      id: 'operation',
      title: '日常維護',
      blocks: [
        {kind: 'h', text: '重載與重新啟動'},
        {kind: 'code', lang: 'sh', text: s.reloadRestart},
        {
          kind: 'p',
          text: '重載會重新讀取組態，並在日誌中記錄 `applied` 或 `rejected`。變更 `native_api`、網路介面、TPROXY 設定、`data_dir`、NFQUEUE 開關、DNS 監聽或 Clash API 監聽後需要重新啟動。doona 的組態頁在套用後會自動重載。'
        },
        {kind: 'h', text: '更新 honk'},
        {
          kind: 'p',
          text: '下載新的 `debug` 檔案，依「安裝 honk」一節安裝，再執行 `sudo systemctl restart honk-core` 並檢查 `honk-core --version`。`debug` 標籤會隨每次建置移動，請將版本與本指南註明的版本對照。'
        },
        {kind: 'h', text: '更新 doona'},
        {kind: 'p', text: '將新版本解壓縮到 `/usr/share/doona`，再於瀏覽器中重新載入頁面。honk 不需重新啟動。'},
        {kind: 'h', text: '更新地理資料'},
        {kind: 'p', text: '在設定的地理資料卡片中按下「更新」，honk 會下載並啟用兩個檔案。自動更新預設開啟，每 24 小時檢查一次；可在同一卡片關閉或變更間隔。'},
        {kind: 'h', text: '檔案位置'},
        {
          kind: 'table',
          head: ['路徑', '內容'],
          rows: [
            ['`/etc/honk/config.dae`', '主組態檔案'],
            ['`/etc/honk/config.d/api.dae`', '原生 API 組態區塊'],
            ['`/var/lib/honk/`', '`data_dir`：地理資料檔案與執行期資料'],
            ['`/var/lib/honk/state/honk.db`', '狀態資料庫'],
            ['`/usr/share/doona/`', '在 `/ui/` 提供的 doona 檔案'],
            ['`journalctl -u honk-core`', 'honk 日誌']
          ]
        }
      ]
    },
    {
      id: 'troubleshooting',
      title: '疑難排解',
      blocks: [
        {kind: 'h', text: 'unknown experimental setting', id: 'unknown-setting'},
        {kind: 'p', text: '`native_api` 的欄位直接寫在 `experimental` 下，honk 因此拒絕此組態。請將欄位移入 `native_api { }`。'},
        {kind: 'code', lang: 'dae', text: s.misplacedField},
        {
          kind: 'p',
          text: '由 main 分支建置的 honk 會以同樣方式拒絕所有 `native_api` 設定，即使它們位於 `native_api { }` 中。請執行 `honk-core --version` 檢查版本並安裝 `debug` 版本，詳見「系統需求」中的「honk 版本」。'
        },
        {kind: 'h', text: 'honk 拒絕 native_api 組態區塊'},
        {
          kind: 'list',
          items: [
            '`configuration administration requires a bearer secret or password login`：`config_write: true` 需要 `password_auth: true` 或 `secret`。',
            '`password login requires an empty secret; a configured secret selects token mode`：兩者只能保留一個。',
            '`password login cannot be combined with anonymous loopback`：刪除 `allow_anonymous_loopback`。'
          ]
        },
        {kind: 'h', text: '狀態資料庫問題', id: 'state-db'},
        {
          kind: 'p',
          text: '本範例設定了 `password_auth: true`，資料庫無法開啟時 honk 會在啟動時結束，日誌顯示 `state database:` 與原因。Token 模式下 honk 會記錄警告並在沒有資料庫的情況下執行：地理資料來源卡片消失，只有同時設定兩個下載網址，「更新」按鈕才會保留。請在日誌中尋找原因：'
        },
        {kind: 'code', lang: 'sh', text: s.stateDbLog},
        {kind: 'p', text: '日誌也會保留先前每次啟動的訊息，請查看最近一次啟動的記錄。'},
        {kind: 'code', lang: 'text', text: s.stateDbMessages},
        {
          kind: 'list',
          ordered: true,
          items: [
            'unavailable：`data_dir` 必須存在，且執行 honk 的使用者可寫入；使用上文的單元時該使用者為 root。`state/` 由 honk 自行建立。',
            'unsafe：`state/` 與 `honk.db` 必須屬於該使用者，且不授予群組或其他使用者任何權限。`honk.db` 必須是一般檔案，不能是符號連結，也不能在 honk 開啟時被替換。',
            'locked：等待 `honk-core admin reset` 執行完畢。',
            'corrupt：設定 `password_auth: true` 時 honk 會結束。Token 模式下 honk 會將檔案移至 `honk.db.corrupt` 並建立新的資料庫；若已存在較早的 `.corrupt` 檔案，honk 會保留兩者，並在該檔案刪除之前不使用資料庫執行。',
            '修正後重新啟動 honk。'
          ]
        },
        {
          kind: 'p',
          text: '`another honk-core has the state database open` 與 `state database has a foreign application id or a newer schema` 一律會阻止啟動：請停止另一個執行個體，或使用寫入該資料庫的 honk 版本。'
        },
        {kind: 'h', text: '固定映射時出現 Invalid argument'},
        {kind: 'p', text: '`/sys/fs/bpf` 不是 bpffs。請依「系統需求」一節掛載。'},
        {kind: 'h', text: '核心版本過舊'},
        {
          kind: 'p',
          text: 'honk 會在掛載前拒絕早於 6.12 的核心。驗證器拒絕編譯後的分流程式時，請使用啟用 BPF 與 BTF 的 Linux 6.12 或更新版本，並保留完整的驗證器日誌以便回報。'
        },
        {kind: 'h', text: '沒有原生 API，或 /api、/ui/ 回傳 404', id: 'no-native-api'},
        {kind: 'p', text: '執行 `honk-core --version`，將執行中的版本與「系統需求」中的「honk 版本」對照。'},
        {
          kind: 'list',
          items: [
            '無法連線到 `listen` 位址：honk 未執行、`enabled` 不是 `true`，或 `listen` 指向其他位址。`enabled: false` 時監聽不會啟動。',
            '`/api` 回傳 404：該位址上的服務沒有原生 API，例如由 main 分支建置的 honk。doona 的登入對話框此時顯示「此 honk 建置沒有提供原生 API」。請安裝 `debug` 版本。',
            '只有 `/ui/` 回傳 404：原生 API 正在執行，但 `ui` 為空。',
            'honk 啟動時以 `failed to inspect native UI directory` 或 `native UI index.html must be a regular file` 結束：請依「安裝 doona 並啟動」一節將 doona 解壓縮到 `ui` 目錄。'
          ]
        },
        {kind: 'h', text: '登入與跨網域失敗', id: 'sign-in'},
        {
          kind: 'list',
          items: [
            '首次設定只能在閘道器本機或私有網路中的用戶端完成。',
            '設定中顯示「網路連線失敗」或「網路或跨網域請求失敗」：無法透過 `listen` 位址存取 honk，或 doona 所在來源未列入 `allow_origins` 與 `allowed_hosts`。',
            '忘記密碼：停止 honk，執行 `sudo honk-core admin reset`，再啟動 honk 重新設定。',
            'HTTPS 頁面無法存取 HTTP API，請參閱「從其他來源開啟 doona」。'
          ]
        },
        {kind: 'h', text: '唯讀的組態檔案', id: 'read-only'},
        {kind: 'p', text: '符合下列任一條件時，doona 會將組態檔案標記為唯讀：'},
        {
          kind: 'list',
          items: [
            '`config_write` 不是 `true`。',
            '既沒有 `password_auth: true`，也沒有 `secret`。',
            '檔案在 `native_api` 或 `clash_api` 中包含 `secret`，或包含與 8 個字元以上監聽密鑰相同的文字。',
            'honk 仍在載入組態檔案，或其寫入協調器未執行。',
            '僅在以 `--store db` 執行時出現，本指南不使用此模式：已啟用的修訂未能記錄，導致寫入被阻止。'
          ]
        },
        {kind: 'p', text: '請將所有密鑰移入 `config.d/api.dae`，並在變更 `native_api` 後重新啟動 honk。'}
      ]
    }
  ]
};
