import {storageKeys} from '../../api/storage';
import {dashboardDefaults, mapWidgets, parseDashboard} from './dashboardLayout';
import {object, parseLayout} from './layout';
import {storedLayout} from './storedLayout';
const store = storedLayout(storageKeys.dashboard, parseDashboard, dashboardDefaults, (layout, absent, persist) => {
  try {
    const legacy = localStorage.getItem(storageKeys.activityGroup);
    let panel: unknown = null;
    try {
      panel = JSON.parse(localStorage.getItem(storageKeys.widgets) ?? 'null');
    } catch {
      /* A panel layout that does not parse holds no split. */
    }
    // The panel's former split of the rates split the dashboard's speed cards too.
    const split = object(panel) && panel.splitRates === true;
    if (!legacy && !split) return layout;
    // An existing dashboard already owns its instance choices, including Automatic.
    const migrated = mapWidgets(layout, item =>
      legacy && absent && item.id === 'latency' && !item.instance ? {...item, group: legacy} : split && item.id === 'speed' ? {...item, split: true} : item
    );
    if (persist(migrated)) {
      try {
        if (legacy) localStorage.removeItem(storageKeys.activityGroup);
        // The panel's parse moves the split onto its own speed widgets, so storing it parsed ends the migration.
        if (split) localStorage.setItem(storageKeys.widgets, JSON.stringify(parseLayout(panel)));
      } catch {
        /* Retain the in-memory migration. */
      }
    }
    return migrated;
  } catch {
    return layout;
  }
});
export const readDashboard = store.read;
export const saveDashboard = store.save;
export const useDashboardLayout = store.useLayout;
