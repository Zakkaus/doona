import {storageKeys} from '../../api/storage';
import {dashboardDefaults, mapWidgets, parseDashboard} from './dashboardLayout';
import {storedLayout} from './storedLayout';
const store = storedLayout(storageKeys.dashboard, parseDashboard, dashboardDefaults, (layout, absent, persist) => {
  try {
    const legacy = localStorage.getItem(storageKeys.activityGroup);
    if (!legacy) return layout;
    // An existing dashboard already owns its instance choices, including Automatic.
    const migrated = absent ? mapWidgets(layout, item => (item.id === 'latency' && !item.instance ? {...item, group: legacy} : item)) : layout;
    if (persist(migrated)) {
      try {
        localStorage.removeItem(storageKeys.activityGroup);
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
