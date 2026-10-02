import type {Key} from '../../i18n';
import type {WidgetSize} from '../../ui/WidgetGrid';
import {clampPanelOffset, clampPanelSize, type PanelOffset, type PanelSize} from '../../ui/panelSize';
import type {Capabilities} from '../../api/model';

export type ModuleForm = 'area' | 'sparkline' | 'donut' | 'waffle' | 'dots' | 'ranked' | 'kv' | 'facts';
export type ModuleSize = WidgetSize | 'wide';
export const contentLimit = (size: ModuleSize, limits: readonly [number, number, number] = [1, 3, 8]) =>
  limits[size === 'small' ? 0 : size === 'medium' ? 1 : 2];
export type Surface = 'panel' | 'dashboard';
type Definition = {
  label: Key;
  resource: keyof Capabilities['resources'] | null;
  forms: ModuleForm[];
  compact: ModuleForm[];
  sizes: WidgetSize[];
  // Offered by the panel only, such as the divider between its groups of widgets.
  panelOnly?: true;
};
const metric = (label: Key, resource: Definition['resource']): Definition => ({
  label,
  resource,
  forms: ['area', 'sparkline', 'kv'],
  compact: ['sparkline', 'kv'],
  sizes: ['small', 'medium', 'large']
});
const list = (label: Key, resource: Definition['resource']): Definition => ({
  label,
  resource,
  forms: ['kv'],
  compact: ['kv'],
  sizes: ['small', 'medium', 'large']
});
const share = (label: Key, resource: Definition['resource']): Definition => ({
  ...list(label, resource),
  forms: ['donut', 'waffle', 'ranked', 'kv'],
  compact: ['donut', 'ranked', 'kv']
});
export const maxInstances = 3;
export const registry = {
  speed: metric('widgets.speed', 'runtime'),
  traffic: {...list('widgets.traffic', 'runtime'), sizes: ['medium']},
  connections: metric('act.active', 'runtime'),
  memory: metric('act.memory', 'runtime_memory'),
  cpu: metric('act.cpu', 'runtime'),
  ranking: {...share('widgets.ranking', 'connections'), forms: ['ranked', 'kv'], compact: ['ranked', 'kv']},
  outbounds: share('widgets.outbounds', 'runtime_outbounds'),
  mode: {...list('act.mode', 'config'), sizes: ['medium']},
  global: {...list('act.global', 'config'), sizes: ['medium']},
  group: {...list('widgets.group', 'groups'), sizes: ['medium']},
  status: {...list('widgets.status', 'runtime'), sizes: ['medium'], forms: ['facts', 'kv'], compact: ['kv']},
  notices: list('widgets.notices', 'events'),
  download: metric('ui.download', 'runtime'),
  upload: metric('ui.upload', 'runtime'),
  latency: {...list('act.latency', 'nodes'), sizes: ['medium']},
  history: metric('act.traffic', 'runtime'),
  nodeLatency: {...list('ui.nodeLatency', 'nodes'), forms: ['dots', 'ranked'], compact: ['dots', 'ranked']},
  sourceHealth: {...list('dashboard.sourceHealth', 'providers'), sizes: ['medium']},
  connectionOutbounds: share('dashboard.connectionOutbounds', 'connections'),
  connectionNetworks: {...share('dashboard.connectionNetworks', 'connections'), sizes: ['medium']},
  dnsAnswers: share('dashboard.dnsAnswers', 'dns_log'),
  policyGroups: list('dashboard.policyGroups', 'groups'),
  divider: {...list('widgets.divider', null), sizes: ['medium'], panelOnly: true}
} satisfies Record<string, Definition>;
export type WidgetId = keyof typeof registry;
export type Widget = {id: WidgetId; instance?: string; form: ModuleForm | 'chart' | 'text'; size: ModuleSize; group?: string; by?: 'dev' | 'domain'};
export const instanceId = (item: Widget) => item.instance ?? item.id;
export const formsFor = (id: WidgetId, surface: Surface): ModuleForm[] => registry[id][surface === 'panel' ? 'compact' : 'forms'] as ModuleForm[];
export const onlyPanel = (id: WidgetId) => 'panelOnly' in registry[id];
const allowsSmall = (id: WidgetId) => (registry[id].sizes as string[]).includes('small');
export function canonicalForm(item: Widget, surface: Surface): ModuleForm {
  const forms = formsFor(item.id, surface);
  if (item.form === 'text') return forms.includes('kv') ? 'kv' : forms.at(-1)!;
  if (item.form === 'chart') return forms[0];
  return forms.includes(item.form) ? item.form : forms[0];
}
export const defaultWidget = (id: WidgetId): Widget => ({id, form: formsFor(id, 'panel')[0], size: 'medium'});
export type Layout = {
  version: 3;
  items: Widget[];
  // The panel's own size, set by its resize handle; absent until the reader resizes it.
  size?: PanelSize;
  // How far the reader moved the panel from its corner; absent until moved.
  offset?: PanelOffset;
  collapsed: boolean;
  // A pinned panel stays as the reader left it on every page; otherwise it collapses when the page changes.
  pinned: boolean;
  // Docked as the sidebar's last section instead of floating over the content; absent while floating.
  docked?: boolean;
  // The docked section's height, set by its top edge; absent until the reader drags it.
  dockHeight?: number;
  visible: boolean;
};
export const defaults = (): Layout => ({
  version: 3,
  items: [defaultWidget('speed'), {id: 'memory', form: 'text', size: 'medium'}, defaultWidget('divider'), defaultWidget('mode')],
  collapsed: false,
  pinned: false,
  visible: true
});
// Restore defaults puts the panel where a fresh profile has it: floating at its corner, at its own size.
export const restoredPanel = {size: undefined, offset: undefined, docked: undefined, dockHeight: undefined} satisfies Partial<Layout>;
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
    if (value.group !== undefined) item.group = value.group as string;
    if (id === 'ranking') item.by = value.by === 'domain' ? 'domain' : 'dev';
    seen.add(key);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    items.push(item);
  }
  return items;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function parseLayout(value: unknown): Layout {
  if (!object(value) || ![1, 2, 3].includes(value.version as number) || !Array.isArray(value.items)) return defaults();
  const items = parseItems(
    value.version === 1 ? value.items.map(item => (object(item) ? {...item, size: 'medium'} : item)) : value.items,
    'panel',
    value.version !== 3
  );
  // Earlier versions' placement and dock fields are dropped: the panel floats until docked again.
  return {
    version: 3,
    items,
    ...(object(value.size) && finite(value.size.width) && finite(value.size.height)
      ? {size: clampPanelSize({width: value.size.width, height: value.size.height})}
      : {}),
    ...(object(value.offset) && finite(value.offset.x) && finite(value.offset.y)
      ? {offset: clampPanelOffset({x: value.offset.x, y: value.offset.y, ...(value.offset.top === true && {top: true as const})})}
      : {}),
    collapsed: value.collapsed === true,
    pinned: value.pinned === true,
    ...(value.docked === true ? {docked: true} : {}),
    ...(finite(value.dockHeight) && value.dockHeight > 0 ? {dockHeight: Math.round(value.dockHeight)} : {}),
    visible: value.visible !== false
  };
}
export function available(id: WidgetId, capabilities: Capabilities | undefined) {
  const resource = registry[id].resource;
  return !resource || capabilities?.resources[resource]?.available === true;
}
