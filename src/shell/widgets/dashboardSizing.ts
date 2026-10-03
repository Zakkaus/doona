import type {Translator} from '../../i18n';
import {contentLimit, heights, registry, rowChoices, widthsFor, type DashboardHeight, type DashboardWidth, type Widget} from './layout';

// A dashboard card's size, apart from its section's default footprint. Width is a fraction of the section, the same
// width in every section; no width (Auto) keeps the footprint the section's profile gives the card's legacy size.
// Height sets the chart area of a charted card or the row count of a list, never the type.
export const heightLabels = {short: 'dashboard.height.short', standard: 'dashboard.height.standard', tall: 'dashboard.height.tall'} as const;
// A chart's height at each step, as a multiple of its standard height.
export const heightScale = {short: 0.75, standard: 1, tall: 2} as const satisfies Record<DashboardHeight, number>;

export const fraction = (width: DashboardWidth) => (width === 'full' ? 1 : Number(width[0]) / Number(width[2]));
// What a card's height adjusts: a chart's height, or a list's row count. `main` is whether the card renders main's
// Activity content (see `mainCard`), whose value tiles carry a sparkline in every form.
export function heightKind(item: Widget, main: boolean): 'chart' | 'rows' | undefined {
  if ((main && registry[item.id].tile) || item.form === 'area' || item.form === 'sparkline') return 'chart';
  return registry[item.id].rows && item.form !== 'donut' && item.form !== 'waffle' ? 'rows' : undefined;
}
// The rows a list shows until its height is set: the limit it had before lists had a height. The source list had none
// and shows every row.
export function legacyRows(item: Widget, main: boolean): number | undefined {
  if (main) return item.id === 'ranking' ? 5 : undefined;
  if (item.id === 'sourceHealth') return undefined;
  if (item.id === 'nodeLatency') return contentLimit(item.size, [3, 6, 12]);
  return item.id === 'ranking' ? Math.min(5, contentLimit(item.size)) : contentLimit(item.size);
}
// A chosen width on a small card gives it a medium card's content: small means the narrow footprint's compact content.
export const withWidth = (item: Widget, width: DashboardWidth | undefined): Widget => ({
  ...item,
  width,
  ...(width && item.size === 'small' ? {size: 'medium' as const} : {})
});
export const scaleOf = (item: Pick<Widget, 'height'>) => heightScale[item.height ?? 'standard'];

// A card's width and height choices, for its settings and its edge handles alike. `fraction` is absent for Auto.
export type SizeChoice = {value: string; label: string; fraction?: number};
export type SizeAxis = {label: string; value: string; options: SizeChoice[]; set: (value: string) => Widget};
export function sizeAxes(item: Widget, main: boolean, t: Translator): {width: SizeAxis; height?: SizeAxis} {
  const width: SizeAxis = {
    label: t('dashboard.width'),
    value: item.width ?? 'auto',
    options: [
      {value: 'auto', label: t('dashboard.automaticWidth')},
      ...widthsFor(item.id).map(value => ({value, label: value === 'full' ? t('dashboard.wide') : value, fraction: fraction(value)}))
    ],
    set: value => withWidth(item, value === 'auto' ? undefined : (value as DashboardWidth))
  };
  const kind = heightKind(item, main);
  if (kind === 'chart')
    return {
      width,
      height: {
        label: t('dashboard.height'),
        value: item.height ?? 'standard',
        options: heights.map(value => ({value, label: t(heightLabels[value])})),
        set: value => ({...item, height: value as DashboardHeight})
      }
    };
  if (kind !== 'rows') return {width};
  // The three steps, and the list's own earlier count as Auto (absent rows) when it is none of them: a number, or every
  // row for a list that had no limit. Auto stays on offer whatever the current choice.
  const legacy = legacyRows(item, main);
  const auto = legacy === undefined || !(rowChoices as readonly number[]).includes(legacy);
  const steps: Array<SizeChoice & {n: number}> = rowChoices.map(n => ({value: String(n), label: t('dashboard.rows', {n}), n}));
  if (auto) steps.push({value: 'auto', label: legacy === undefined ? t('dashboard.allRows') : t('dashboard.rows', {n: legacy}), n: legacy ?? Infinity});
  const rows = item.rows ?? legacy;
  return {
    width,
    height: {
      label: t('dashboard.height'),
      value: item.rows === undefined && auto ? 'auto' : String(rows),
      options: steps.sort((a, b) => a.n - b.n).map(({value, label}) => ({value, label})),
      set: value => ({...item, rows: value === 'auto' ? undefined : Number(value)})
    }
  };
}

// A size the gallery offers a new card: a width, and for a card with a height its tall step.
export type Preset = {width: DashboardWidth; height?: DashboardHeight; rows?: number};
export const withPreset = (item: Widget, preset: Preset): Widget => ({
  ...withWidth(item, preset.width),
  ...(preset.height ? {height: preset.height} : {}),
  ...(preset.rows ? {rows: preset.rows} : {})
});
// The gallery's sizes for a card: its narrowest width of a quarter or more, a half and full width, then a half at its
// tallest height, when it has one.
export function presetsFor(item: Widget, main: boolean): Preset[] {
  const allowed = widthsFor(item.id);
  const narrowest = allowed.find(width => width !== '1/5')!;
  const presets: Preset[] = [...new Set([narrowest, '1/2' as const, 'full' as const])].filter(width => allowed.includes(width)).map(width => ({width}));
  const kind = heightKind(item, main);
  if (kind === 'chart') presets.push({width: '1/2', height: 'tall'});
  if (kind === 'rows') presets.push({width: '1/2', rows: rowChoices.at(-1)});
  return presets;
}
export const presetLabel = (preset: Preset, t: Translator) => {
  const width = preset.width === 'full' ? t('dashboard.wide') : preset.width;
  if (preset.height) return t('dashboard.preset', {width, height: t(heightLabels[preset.height])});
  return preset.rows ? t('dashboard.preset', {width, height: t('dashboard.rows', {n: preset.rows})}) : width;
};
