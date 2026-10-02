import {instanceId, maxInstances} from './layout';
import {dashboardItems, type DashboardLayout, type Profile} from './dashboardLayout';
// The editor's operations, loaded with the editor.
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
// Removes a card, and returns the function that puts it back where it was in the layout as it is by then: at its
// place in its section, while `restorable` holds, that is unless the card is on the page again or its module has
// reached its instance limit since.
export function removeWidget(
  layout: DashboardLayout,
  id: string
): {layout: DashboardLayout; restore: (current: DashboardLayout) => DashboardLayout; restorable: (current: DashboardLayout) => boolean} {
  const home = layout.sections.find(section => section.items.some(item => instanceId(item) === id));
  if (!home) return {layout, restore: current => current, restorable: () => false};
  const at = home.items.findIndex(item => instanceId(item) === id);
  const item = home.items[at];
  const restorable = (current: DashboardLayout) => {
    const items = dashboardItems(current);
    return !items.some(old => instanceId(old) === id) && items.filter(old => old.id === item.id).length < maxInstances;
  };
  return {
    layout: {
      ...layout,
      sections: layout.sections.map(section => (section === home ? {...section, items: section.items.filter(old => old !== item)} : section))
    },
    restore: current =>
      restorable(current)
        ? {
            ...current,
            sections: current.sections.map(section =>
              section.id === home.id ? {...section, items: [...section.items.slice(0, at), item, ...section.items.slice(at)]} : section
            )
          }
        : current,
    restorable
  };
}
