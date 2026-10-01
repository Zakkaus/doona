import {instanceId, type ModuleSize} from './layout';
import {dashboardItems, type DashboardLayout, type Profile} from './dashboardLayout';
// The editor's operations, loaded with the editor.
// The sizes a card offers in a section: main's sections size by their tracks, so they have no smaller step.
export function sizesFor(profile: Profile, sizes: readonly string[]): ModuleSize[] {
  if (sizes.length < 2) return ['medium'];
  if (profile === 'extensions') return [...(sizes.includes('small') ? (['small'] as const) : []), 'medium', 'large', 'wide'];
  return profile === 'metrics' || profile === 'details' ? ['medium', 'large', 'wide'] : ['medium', 'wide'];
}
export type Placement = {section: Profile; target?: string; after?: boolean};
// One transaction for every move: the card leaves its section and lands before or after the target, or at the end.
export function placeWidget(layout: DashboardLayout, id: string, place: Placement): DashboardLayout {
  const item = dashboardItems(layout).find(old => instanceId(old) === id);
  if (!item || place.target === id) return layout;
  const sections = layout.sections.map(section => ({...section, items: section.items.filter(old => instanceId(old) !== id)}));
  const section = sections.find(section => section.id === place.section);
  if (!section) return layout;
  const at = place.target === undefined ? -1 : section.items.findIndex(old => instanceId(old) === place.target);
  section.items.splice(at < 0 ? section.items.length : at + (place.after ? 1 : 0), 0, item);
  return {...layout, sections};
}
// Moves a card one place earlier or later on the page, across a section boundary when it is first or last.
export function stepWidget(layout: DashboardLayout, id: string, delta: -1 | 1): DashboardLayout {
  const index = layout.sections.findIndex(section => section.items.some(item => instanceId(item) === id));
  if (index < 0) return layout;
  const items = layout.sections[index].items;
  const at = items.findIndex(item => instanceId(item) === id);
  const neighbour = items[at + delta];
  if (neighbour) return placeWidget(layout, id, {section: layout.sections[index].id, target: instanceId(neighbour), after: delta > 0});
  const next = layout.sections[index + delta];
  if (!next) return layout;
  const edge = delta > 0 ? next.items[0] : next.items.at(-1);
  return placeWidget(layout, id, {section: next.id, ...(edge ? {target: instanceId(edge), after: delta < 0} : {})});
}
