# 主题与配色

[English](themes.md) / 简体中文 / [繁體中文](themes.zh-TW.md)

标准版定义了 16 套配色，每套都有浅色与深色。配色、壁纸及透明度的选择方法见[外观设置](https://doona.daeuniverse.org/zh-CN/config-and-settings.html#修改外观)。

浅色与深色示例见[配色对比图](https://doona.daeuniverse.org/screenshots/palettes.webp)。

## 源码索引

| 源码                                                        | 职责                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [src/shell/palettes.ts](../src/shell/palettes.ts)           | 配色 ID、菜单顺序、标签键、可选文案替换与默认配色 `rose-pine/moon` |
| [src/shell/preferences.ts](../src/shell/preferences.ts)     | 已保存配色的校验，以及 `system`、`light`、`dark` 颜色模式          |
| [src/shell/useAppearance.ts](../src/shell/useAppearance.ts) | 将 `data-family`、`data-flavour` 与 `data-scheme` 应用到文档根元素 |
| [src/ui/styles/palettes/](../src/ui/styles/palettes/)       | 每个配色系列一个 CSS 文件，包含浅色与深色变量                      |
| [src/ui/styles/palettes.css](../src/ui/styles/palettes.css) | 启动时加载的配色系列的导入                                         |
| [src/shell/glass.ts](../src/shell/glass.ts)                 | 按需加载玻璃样式与壁纸                                             |
| [src/shell/halloween.ts](../src/shell/halloween.ts)         | 按需加载万圣节样式、卡片插图与标志                                 |
| [src/shell/paletteSheet.ts](../src/shell/paletteSheet.ts)   | 为按需加载的配色系列链接样式表                                     |
| [src/ui/charts/palette.ts](../src/ui/charts/palette.ts)     | 为图表读取 CSS 变量并监听配色变化                                  |

## 配色约定

配色 ID 的格式为 `family/flavour`。只有一种变体的系列重复名称，例如 `nord/nord`。CSS 选择器依据这两个值与 `data-scheme` 选择变量，组件使用共用的 `--rp-*` 变量。

每套配色都提供表面、文字、强调色、图表、高亮与阴影变量。完整变量表及对比度规则见[新增配色](../CONTRIBUTING.md#add-a-palette)。[tools/palettes.test.mjs](../tools/palettes.test.mjs) 检查系列文件、导入与必需变量。

玻璃配色变量通过 [src/ui/styles/glass.css](../src/ui/styles/glass.css) 与材质样式一起加载。修改玻璃配色时须保留此独立加载方式。万圣节样式表及其卡片插图与替换标志也以相同方式加载，只在选用该配色时加载。

强国配色将运行状态显示为稳中向好，不可用与降级状态显示为严峻挑战；万圣节配色则分别显示为闹鬼中与中邪。文案替换由 `src/shell/palettes.ts` 与语言目录定义。

## 新增或更新配色

1. 更新 `src/shell/palettes.ts` 与系列样式表。新增系列时，在 `src/ui/styles/palettes.css` 中导入；像玻璃与万圣节一样按需加载的系列除外。
2. 在 [src/i18n/locales/](../src/i18n/locales/) 中加入标签键。注册表的可选 `words` 映射可将已有翻译键指向配色专用键。
3. 系列图片放在样式表旁的 `src/ui/styles/palettes/<family>/` 中，并在 [NOTICE](../NOTICE) 与 [REUSE.toml](../REUSE.toml) 中记录来源及许可证。
4. 更新 [e2e/contrast.spec.ts](../e2e/contrast.spec.ts) 中的配色表。执行 [CONTRIBUTING.md](../CONTRIBUTING.md#add-a-palette) 要求的配色与对比度检查，并检查浅色及深色效果。对比度测试不对半透明玻璃表面执行数值检查。
