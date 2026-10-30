# 主題與配色

[English](themes.md) / [简体中文](themes.zh-CN.md) / 繁體中文

標準版定義了 16 套配色，每套都有淺色與深色。配色、桌布及透明度的選擇方法見[外觀設定](https://doona.daeuniverse.org/zh-TW/config-and-settings.html#修改外觀)。

淺色與深色範例見[配色比較圖](https://doona.daeuniverse.org/screenshots/palettes.webp)。

## 原始碼索引

| 原始碼                                                      | 職責                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [src/shell/palettes.ts](../src/shell/palettes.ts)           | 配色 ID、選單順序、標籤鍵、選用文案替換與預設配色 `rose-pine/moon` |
| [src/shell/preferences.ts](../src/shell/preferences.ts)     | 已儲存配色的驗證，以及 `system`、`light`、`dark` 色彩模式          |
| [src/shell/useAppearance.ts](../src/shell/useAppearance.ts) | 將 `data-family`、`data-flavour` 與 `data-scheme` 套用到文件根元素 |
| [src/ui/styles/palettes/](../src/ui/styles/palettes/)       | 每個配色系列一個 CSS 檔案，包含淺色與深色變數                      |
| [src/ui/styles/palettes.css](../src/ui/styles/palettes.css) | 啟動時載入的配色系列的匯入                                         |
| [src/shell/glass.ts](../src/shell/glass.ts)                 | 按需載入玻璃樣式與桌布                                             |
| [src/shell/halloween.ts](../src/shell/halloween.ts)         | 按需載入萬聖節樣式、卡片插圖與標誌                                 |
| [src/shell/paletteSheet.ts](../src/shell/paletteSheet.ts)   | 為按需載入的配色系列連結樣式表                                     |
| [src/ui/charts/palette.ts](../src/ui/charts/palette.ts)     | 為圖表讀取 CSS 變數並監聽配色變化                                  |

## 配色約定

配色 ID 的格式為 `family/flavour`。只有一種變體的系列重複名稱，例如 `nord/nord`。CSS 選擇器依據這兩個值與 `data-scheme` 選擇變數，元件使用共用的 `--rp-*` 變數。

每套配色都提供表面、文字、強調色、圖表、突顯與陰影變數。完整變數表及對比度規則見[新增配色](../CONTRIBUTING.md#add-a-palette)。[tools/palettes.test.mjs](../tools/palettes.test.mjs) 檢查系列檔案、匯入與必要變數。

玻璃配色變數透過 [src/ui/styles/glass.css](../src/ui/styles/glass.css) 與材質樣式一起載入。修改玻璃配色時須保留此獨立載入方式。萬聖節樣式表及其卡片插圖與替換標誌也以相同方式載入，只在選用該配色時載入。

強國配色將執行狀態顯示為穩中向好，不可用與降級狀態顯示為嚴峻挑戰；萬聖節配色則分別顯示為鬧鬼中與中邪。文案替換由 `src/shell/palettes.ts` 與語言目錄定義。

## 新增或更新配色

1. 更新 `src/shell/palettes.ts` 與系列樣式表。新增系列時，在 `src/ui/styles/palettes.css` 中匯入；像玻璃與萬聖節一樣按需載入的系列除外。
2. 在 [src/i18n/locales/](../src/i18n/locales/) 中加入標籤鍵。登錄表的選用 `words` 對應可將既有翻譯鍵指向配色專用鍵。
3. 系列圖片放在樣式表旁的 `src/ui/styles/palettes/<family>/` 中，並在 [NOTICE](../NOTICE) 與 [REUSE.toml](../REUSE.toml) 中記錄來源及授權條款。
4. 更新 [e2e/contrast.spec.ts](../e2e/contrast.spec.ts) 中的配色表。執行 [CONTRIBUTING.md](../CONTRIBUTING.md#add-a-palette) 要求的配色與對比度檢查，並檢查淺色及深色效果。對比度測試不對半透明玻璃表面執行數值檢查。
