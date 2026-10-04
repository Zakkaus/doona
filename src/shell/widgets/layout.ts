import {createContext} from 'react';
import type {Key} from '../../i18n';
import type {WidgetSize} from '../../ui/WidgetGrid';
import {clampPanelOffset, clampPanelSize, type PanelOffset, type PanelSize} from '../../ui/panelSize';
import type {Capabilities} from '../../api/model';

export type ModuleForm = 'area' | 'sparkline' | 'donut' | 'waffle' | 'dots' | 'ranked' | 'kv' | 'facts';
export type ModuleSize = WidgetSize | 'wide';
export const contentLimit = (size: ModuleSize, limits: readonly [number, number, number] = [1, 3, 8]) =>
  limits[size === 'small' ? 0 : size === 'medium' ? 1 : 2];
export type Surface = 'panel' | 'dashboard';
// Where a widget renders: the dashboard's cards provide it, anything else is the panel.
export const WidgetSurface = createContext<Surface>('panel');
type Definition = {
  label: Key;
  resource: keyof Capabilities['resources'] | null;
  forms: ModuleForm[];
  compact: ModuleForm[];
  sizes: WidgetSize[];
  // The panel's sizes for the key-value form when they are fewer than `sizes`, as a metric's large one draws no more
  // than its medium one.
  kvSizes?: WidgetSize[];
  // A value tile: a fifth of a row wide at the narrowest, as five share main's metrics row, and a sparkline in every
  // form of main's card.
  tile?: true;
  // The narrowest dashboard width other than a value tile's, when it is not a third, as half for a table of nodes.
  narrowest?: DashboardWidth;
  // The widest dashboard width its content fills, when full width would leave it blank on the right.
  widest?: DashboardWidth;
  // A list, whose dashboard height is its row count unless drawn as a donut or a waffle.
  rows?: true;
  // Charts a traffic rate, whose live value the chart's legend carries.
  rate?: true;
  // The panel hides its title, as its content names what it shows.
  untitled?: true;
  // Follows one policy group chosen in its settings; the key names the Automatic choice.
  groupChoice?: Key;
  // Offered by the panel only, such as the divider between its groups of widgets.
  panelOnly?: true;
};
const metric = (label: Key, resource: Definition['resource']): Definition => ({
  label,
  resource,
  forms: ['area', 'sparkline', 'kv'],
  compact: ['sparkline', 'kv'],
  sizes: ['small', 'medium', 'large'],
  kvSizes: ['small', 'medium']
});
const list = (label: Key, resource: Definition['resource']): Definition => ({
  label,
  resource,
  forms: ['kv'],
  compact: ['kv'],
  sizes: ['small', 'medium', 'large']
});
// A split of a total; one of a fixed few categories, as answers by outcome, has no row count and needs at most half a row.
const split = (label: Key, resource: Definition['resource']): Definition => ({
  ...list(label, resource),
  forms: ['donut', 'waffle', 'ranked', 'kv'],
  compact: ['donut', 'ranked', 'kv']
});
const share = (label: Key, resource: Definition['resource']): Definition => ({...split(label, resource), rows: true});
export const maxInstances = 3;
const definitions = {
  speed: {...metric('widgets.speed', 'runtime'), rate: true},
  traffic: {...list('widgets.traffic', 'runtime'), sizes: ['medium'], widest: '1/2'},
  connections: {...metric('act.active', 'runtime'), tile: true, untitled: true},
  memory: {...metric('act.memory', 'runtime_memory'), tile: true},
  cpu: {...metric('act.cpu', 'runtime'), tile: true, untitled: true},
  ranking: {...share('widgets.ranking', 'connections'), forms: ['ranked', 'kv'], compact: ['ranked', 'kv']},
  outbounds: share('widgets.outbounds', 'runtime_outbounds'),
  mode: {...list('act.mode', 'config'), sizes: ['medium']},
  global: {...list('act.global', 'config'), sizes: ['medium'], untitled: true},
  group: {...list('widgets.group', 'groups'), sizes: ['medium'], widest: '2/3'},
  status: {...list('widgets.status', 'runtime'), sizes: ['medium'], forms: ['facts', 'kv'], compact: ['kv']},
  notices: list('widgets.notices', 'events'),
  download: {...metric('ui.download', 'runtime'), tile: true, rate: true},
  upload: {...metric('ui.upload', 'runtime'), tile: true, rate: true},
  latency: {...list('act.latency', 'nodes'), sizes: ['medium'], tile: true, groupChoice: 'act.groupFollow'},
  history: {...metric('act.traffic', 'runtime'), rate: true},
  nodeLatency: {
    ...list('ui.nodeLatency', 'nodes'),
    forms: ['dots', 'ranked'],
    compact: ['dots', 'ranked'],
    rows: true,
    narrowest: '1/2',
    groupChoice: 'dashboard.allGroups'
  },
  sourceHealth: {...list('dashboard.sourceHealth', 'providers'), sizes: ['medium'], rows: true},
  providerBudget: {...list('dashboard.providerBudget', 'providers'), sizes: ['medium'], rows: true},
  connectionOutbounds: share('dashboard.connectionOutbounds', 'connections'),
  connectionNetworks: {...split('dashboard.connectionNetworks', 'connections'), sizes: ['medium'], widest: '1/2'},
  dnsAnswers: {...split('dashboard.dnsAnswers', 'dns_log'), widest: '1/2'},
  policyGroups: {...list('dashboard.policyGroups', 'groups'), rows: true, groupChoice: 'dashboard.allGroups'},
  outboundErrors: {...share('widgets.outboundErrors', 'runtime_outbounds'), forms: ['ranked', 'kv'], compact: ['ranked', 'kv'], sizes: ['medium', 'large']},
  nodeAvailability: {...list('widgets.nodeAvailability', 'nodes'), sizes: ['small', 'medium'], narrowest: '1/5', widest: '1/3'},
  // Upstream rows from the panel's large size or the dashboard's tall height; key-value is the median and p95 alone.
  dnsLatency: {...list('widgets.dnsLatency', 'dns_log'), forms: ['dots', 'kv'], compact: ['dots', 'kv'], kvSizes: ['small', 'medium'], widest: '2/3'},
  divider: {...list('widgets.divider', null), sizes: ['medium'], panelOnly: true}
} satisfies Record<string, Definition>;
export type WidgetId = keyof typeof definitions;
export const registry: Record<WidgetId, Definition> = definitions;
export type Widget = {
  id: WidgetId;
  instance?: string;
  form: ModuleForm | 'chart' | 'text';
  size: ModuleSize;
  group?: string;
  by?: 'dev' | 'domain';
  // The rates widget draws download and upload as two sparklines instead of one chart; absent while combined.
  split?: true;
  // Dashboard only, see dashboardSizing.ts; absent means Auto width, standard height and the list's own row count.
  width?: DashboardWidth;
  height?: DashboardHeight;
  rows?: number;
};
// A dashboard card's size apart from its section's footprint (see dashboardSizing.ts): a width is a fraction of the
// section, the same in every section, and a height a chart's step or a list's row count.
export const widths = ['1/5', '1/4', '1/3', '1/2', '2/3', 'full'] as const;
export type DashboardWidth = (typeof widths)[number];
export const heights = ['short', 'standard', 'tall'] as const;
export type DashboardHeight = (typeof heights)[number];
export const rowChoices = [3, 5, 8] as const;
// From the narrowest width a card's content still reads at, a value tile a fifth, a card with its own narrowest that one,
// any other a third, to its widest, full width unless it has its own.
const span = ({tile, narrowest, widest}: Definition) => [widths.indexOf(tile ? '1/5' : (narrowest ?? '1/3')), widths.indexOf(widest ?? 'full')];
export const widthsFor = (id: WidgetId): readonly DashboardWidth[] => {
  const [from, to] = span(registry[id]);
  return widths.slice(from, to + 1);
};
// The offered width nearest a stored one, as a width the card no longer offers or one from a newer or edited layout.
export const nearestWidth = (id: WidgetId, width: DashboardWidth) => {
  const [from, to] = span(registry[id]);
  return widths[Math.min(Math.max(widths.indexOf(width), from), to)];
};

export const instanceId = (item: Widget) => item.instance ?? item.id;
// Replaces the item with the same instance as `item`, for `items.map` and `mapWidgets` alike.
export const replaceWidget = (item: Widget) => (old: Widget) => (instanceId(old) === instanceId(item) ? item : old);
export const formsFor = (id: WidgetId, surface: Surface): ModuleForm[] => registry[id][surface === 'panel' ? 'compact' : 'forms'];
export const onlyPanel = (id: WidgetId) => registry[id].panelOnly === true;
export const sizesFor = (id: WidgetId, form: ModuleForm, surface: Surface): readonly WidgetSize[] =>
  (surface === 'panel' && form === 'kv' && registry[id].kvSizes) || registry[id].sizes;
const allowsSmall = (id: WidgetId) => registry[id].sizes.includes('small');
export function canonicalForm(item: Widget, surface: Surface): ModuleForm {
  const forms = formsFor(item.id, surface);
  if (item.form === 'text') return forms.includes('kv') ? 'kv' : forms.at(-1)!;
  if (item.form === 'chart') return forms[0];
  return forms.includes(item.form) ? item.form : forms[0];
}
export const defaultWidget = (id: WidgetId): Widget => ({id, form: formsFor(id, 'panel')[0], size: 'medium'});
export type Layout = {
  version: 4;
  items: Widget[];
  // The panel's own size, set by its resize handle; absent until the reader resizes it.
  size?: PanelSize;
  // How far the reader moved the panel from its corner; absent until moved.
  offset?: PanelOffset;
  collapsed: boolean;
  // A pinned panel stays as the reader left it on every page; otherwise it collapses when the page changes.
  pinned: boolean;
  // The panel shows each widget's title above it; absent while hidden, when the title stays the widget's accessible name.
  titles?: true;
  // Docked as the sidebar's last section instead of floating over the content; absent while floating.
  docked?: boolean;
  // The docked section's height, set by its top edge; absent until the reader drags it.
  dockHeight?: number;
  // The floating, unpinned panel hides at the screen edge nearest to it until hovered; absent while off.
  edge?: boolean;
  visible: boolean;
};
export const defaults = (): Layout => ({
  version: 4,
  items: [defaultWidget('speed'), {id: 'memory', form: 'text', size: 'medium'}, defaultWidget('mode')],
  collapsed: false,
  pinned: true,
  visible: true
});
// Restore defaults puts the panel where a fresh profile has it: floating at its corner, at its own size.
export const restoredPanel = {size: undefined, offset: undefined, docked: undefined, dockHeight: undefined} satisfies Partial<Layout>;
// Whether restoring the panel would change this layout: any of its placement fields is set.
export const changesPanel = (layout: Partial<Layout>) =>
  (Object.keys(restoredPanel) as Array<keyof typeof restoredPanel>).some(key => layout[key] !== undefined);
export const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const widgetId = (value: string): value is WidgetId => Object.hasOwn(registry, value);
export function parseItems(values: unknown[], surface: Surface, legacy = false): Widget[] {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const items: Widget[] = [];
  for (const value of values) {
    if (!object(value) || typeof value.id !== 'string' || !widgetId(value.id)) continue;
    const id = value.id;
    if (surface === 'dashboard' && onlyPanel(id)) continue;
    if (value.instance !== undefined && (typeof value.instance !== 'string' || !value.instance.length || value.instance.length > 128)) continue;
    const key = value.instance ?? id;
    if (seen.has(key) || (counts.get(id) ?? 0) >= maxInstances) continue;
    if (value.form !== undefined && value.form !== 'chart' && value.form !== 'text' && !formsFor(id, surface).includes(value.form as ModuleForm)) continue;
    if (value.group !== undefined && typeof value.group !== 'string') continue;
    if (value.by !== undefined && value.by !== 'dev' && value.by !== 'domain') continue;
    const size: ModuleSize =
      registry[id].sizes.length === 1
        ? 'medium'
        : value.size === 'wide' && surface === 'dashboard'
          ? 'wide'
          : value.size === 'large'
            ? 'large'
            : value.size === 'small' && allowsSmall(id)
              ? 'small'
              : 'medium';
    const item: Widget = {id, ...(key !== id ? {instance: key} : {}), size, form: (value.form as Widget['form']) ?? formsFor(id, surface)[0]};
    if (legacy && surface === 'panel') item.form = size === 'small' ? 'text' : size === 'large' ? 'chart' : item.form;
    item.form = canonicalForm(item, surface);
    // A size the form no longer offers, as a stored large key-value metric, reads as medium.
    if (surface === 'panel' && item.size === 'large' && !sizesFor(id, item.form as ModuleForm, surface).includes('large')) item.size = 'medium';
    if (value.group !== undefined) item.group = value.group as string;
    if (id === 'ranking') item.by = value.by === 'domain' ? 'domain' : 'dev';
    if (id === 'speed' && value.split === true) item.split = true;
    if (surface === 'dashboard') {
      if (widths.includes(value.width as DashboardWidth)) item.width = nearestWidth(id, value.width as DashboardWidth);
      if (heights.includes(value.height as DashboardHeight)) item.height = value.height as DashboardHeight;
      // A row count on a card that has none, as a split of fixed categories, reads as its natural height.
      if (registry[id].rows && (rowChoices as readonly unknown[]).includes(value.rows)) item.rows = value.rows as number;
    }
    seen.add(key);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    items.push(item);
  }
  return items;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function parseLayout(value: unknown): Layout {
  if (!object(value) || ![1, 2, 3, 4].includes(value.version as number) || !Array.isArray(value.items)) return defaults();
  // The panel's former split of the rates, one choice for all of them, reads as every rates widget's own.
  const items = parseItems(
    value.items.map(item => (object(item) ? {...item, ...(value.version === 1 && {size: 'medium'}), ...(value.splitRates === true && {split: true})} : item)),
    'panel',
    (value.version as number) < 3
  );
  // Earlier versions' placement and dock fields are dropped: the panel floats until docked again.
  return {
    version: 4,
    items,
    ...(object(value.size) && finite(value.size.width) && finite(value.size.height)
      ? {size: clampPanelSize({width: value.size.width, height: value.size.height})}
      : {}),
    ...(object(value.offset) && finite(value.offset.x) && finite(value.offset.y)
      ? {offset: clampPanelOffset({x: value.offset.x, y: value.offset.y, ...(value.offset.top === true && {top: true as const})})}
      : {}),
    collapsed: value.collapsed === true,
    // Before version 4 a panel was unpinned by default, which a stored false cannot tell from a choice: it reads as
    // pinned, the default since.
    pinned: value.version !== 4 || value.pinned === true,
    ...(value.titles === true ? {titles: true} : {}),
    ...(value.docked === true ? {docked: true} : {}),
    ...(finite(value.dockHeight) && value.dockHeight > 0 ? {dockHeight: Math.round(value.dockHeight)} : {}),
    ...(value.edge === true ? {edge: true} : {}),
    visible: value.visible !== false
  };
}
export function available(id: WidgetId, capabilities: Capabilities | undefined) {
  const resource = registry[id].resource;
  return !resource || capabilities?.resources[resource]?.available === true;
}
