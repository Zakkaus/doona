import type {TileProps} from '../../ui/DashboardTile';
import {defaultWidget, instanceId, object, parseItems, type Widget, type WidgetId} from './layout';
// Each section keeps one layout profile for good: adding, moving or resizing a card never switches another card's rules.
export const profiles = ['quick', 'metrics', 'traffic', 'details', 'extensions'] as const;
export type Profile = (typeof profiles)[number];
export type Section = {id: Profile; items: Widget[]};
export type DashboardLayout = {version: 3; sections: Section[]};
// origin/main's Activity page, card for card; the extensions section only adds cards after it.
const mainSections: Record<Exclude<Profile, 'extensions'>, WidgetId[]> = {
  quick: ['mode', 'global', 'status'],
  metrics: ['download', 'upload', 'connections', 'latency', 'cpu'],
  traffic: ['history', 'outbounds'],
  details: ['ranking', 'memory', 'notices']
};
const mainForms: Partial<Record<WidgetId, Widget['form']>> = {history: 'area', memory: 'area', status: 'facts'};
// The main cards whose footprint differs from their section's other cards: the mode card takes a full row at tablet
// width, the last two metrics take three of six tracks between 1100 and 1279px and CPU a full row below, notices a full
// row at 1024-1279px. A footprint belongs to the card's first instance, not to whichever card sits in that position.
const footprints: Partial<Record<WidgetId, string>> = {mode: 'lead', latency: 'tail', cpu: 'end', notices: 'end'};
export const footprint = (item: Widget) => (item.instance ? undefined : footprints[item.id]);
// A card's cell attributes, the same on the page and in the editor.
export const tileOf = (item: Widget): TileProps => ({
  id: instanceId(item),
  module: item.id,
  size: item.size,
  foot: footprint(item),
  width: item.width,
  height: item.height
});
const mainWidget = (id: WidgetId): Widget => ({...defaultWidget(id), ...(mainForms[id] ? {form: mainForms[id]} : {})});
// Main's own content renders a card while it keeps main's display; another display needs the general renderer.
export const mainCard = (item: Widget) => Object.values(mainSections).some(ids => ids.includes(item.id)) && item.form === mainWidget(item.id).form;
// Parsed like a stored layout, so a reset draft equals the same layout saved and read back.
export const dashboardDefaults = (): DashboardLayout =>
  sectioned([
    ...Object.entries(mainSections).map(([id, ids]): [Profile, Widget[]] => [id as Profile, ids.map(mainWidget)]),
    [
      'extensions',
      [{...defaultWidget('nodeLatency'), size: 'wide'}, defaultWidget('connectionOutbounds'), defaultWidget('dnsAnswers'), defaultWidget('policyGroups')]
    ]
  ]);
export const dashboardItems = (layout: DashboardLayout) => layout.sections.flatMap(section => section.items);
// Instance ids stay unique and capped across the whole page, so parse every section's cards as one list.
function sectioned(groups: Array<[Profile, unknown[]]>): DashboardLayout {
  const owner = new Map<string, Profile>();
  for (const [id, values] of groups)
    for (const value of values) if (object(value) && !owner.has(String(value.instance ?? value.id))) owner.set(String(value.instance ?? value.id), id);
  const items = parseItems(
    groups.flatMap(([, values]) => values),
    'dashboard'
  );
  return {version: 3, sections: profiles.map(id => ({id, items: items.filter(item => owner.get(instanceId(item)) === id)}))};
}
// Version 1 kept one list. Main's untouched layout maps card for card into main's sections; a list the reader had
// rearranged keeps its order in the extensions section, whose grid is the one that list used.
function migrate(values: unknown[], original: boolean): DashboardLayout {
  if (!original) return sectioned([['extensions', values]]);
  const home = (value: unknown): Profile => {
    if (!object(value) || value.instance !== undefined) return 'extensions';
    return (Object.entries(mainSections).find(([, ids]) => ids.includes(value.id as WidgetId))?.[0] as Profile) ?? 'extensions';
  };
  return sectioned(profiles.map(id => [id, values.filter(value => home(value) === id)]));
}
export function parseDashboard(value: unknown): DashboardLayout {
  if (!object(value)) return dashboardDefaults();
  if (value.version === 1 && Array.isArray(value.items)) return migrate(value.items, value.original === true);
  // Version 3 added width, height and rows to cards; a version 2 card has none of them, so it reads unchanged.
  if ((value.version !== 2 && value.version !== 3) || !Array.isArray(value.sections)) return dashboardDefaults();
  const sections = value.sections.filter(object);
  return sectioned(profiles.map(id => [id, (sections.find(section => section.id === id && Array.isArray(section.items))?.items as unknown[]) ?? []]));
}
export const mapWidgets = (layout: DashboardLayout, map: (item: Widget) => Widget | null): DashboardLayout => ({
  ...layout,
  sections: layout.sections.map(section => ({...section, items: section.items.flatMap(item => map(item) ?? [])}))
});
