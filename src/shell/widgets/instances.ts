import {uuid} from '../../api/hash';
import {defaultWidget, instanceId, maxInstances, type Widget, type WidgetId} from './layout';
// The editors' list operations, loaded with the editors.
export const addInstance = (items: Widget[], id: WidgetId) =>
  items.filter(item => item.id === id).length < maxInstances
    ? {...defaultWidget(id), ...(items.some(item => instanceId(item) === id) ? {instance: uuid()} : {})}
    : null;
export function moveWidget(items: Widget[], id: string, delta: number) {
  const from = items.findIndex(item => instanceId(item) === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
