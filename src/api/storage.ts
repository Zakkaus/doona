// Every key doona keeps in localStorage and sessionStorage. Browsers already hold these strings, so a value never
// changes: a renamed key would lose what readers saved. The mock backend's development switches are its own.
export const storageKeys = {
  lang: 'doona-lang',
  widgets: 'doona-widgets',
  dashboard: 'doona-dashboard',
  navGroups: 'doona-nav-groups',
  scheme: 'doona-scheme',
  palette: 'doona-palette',
  wordmark: 'doona-wordmark',
  mirror: 'doona-mirror',
  countryFlags: 'doona-country-flags',
  sparklines: 'doona-sparklines',
  flagOverrides: 'doona-flag-overrides',
  toastPlacement: 'doona-toast-placement',
  startPage: 'doona-start-page',
  profiles: 'doona-profiles',
  profile: 'doona-profile',
  // The single-backend settings from before profiles, read once to migrate them.
  legacyApi: 'doona-api',
  legacyToken: 'doona-api-token',
  // One key per backend and ring; see rings.ts.
  ringsPrefix: 'doona-rings-',
  connectionsView: 'doona-connections-view',
  activityGroup: 'doona-activity-group',
  gettingStarted: 'doona-getting-started',
  // sessionStorage
  session: 'doona-session',
  saved: 'doona-saved',
  hubPages: 'doona-hub-pages'
} as const;
