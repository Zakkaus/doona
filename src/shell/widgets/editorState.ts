import type {SearchTarget} from '../routes';

let open = false;
const listeners = new Set<() => void>();
export const editorState = {
  snapshot: () => open,
  set(value: boolean) {
    open = value;
    listeners.forEach(notify => notify());
  },
  subscribe(notify: () => void) {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }
};
// The widget editor opens over any page; the dashboard is edited on Activity.
export const widgetTargets: SearchTarget[] = [
  {id: 'widgets:edit', titleKey: 'widgets.edit', route: null, open: () => editorState.set(true), aliases: ['widget panel']},
  {id: 'dashboard:edit', titleKey: 'dashboard.edit', parentKey: 'nav.activity', route: 'activity', aliases: ['dashboard']}
];
