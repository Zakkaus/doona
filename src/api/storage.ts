// Every key doona keeps in localStorage and sessionStorage. Browsers already hold these strings, so a value never
// changes: a renamed key would lose what readers saved. The mock backend's development switches are its own.
export const storageKeys = {
  lang: 'doona-lang',
  widgets: 'doona-widgets',
  dashboard: 'doona-dashboard',
  navGroups: 'doona-nav-groups',
  scheme: 'doona-scheme',
  palette: 'doona-palette',
  blur: 'doona-blur',
  wordmark: 'doona-wordmark',
  mirror: 'doona-mirror',
  countryFlags: 'doona-country-flags',
  lensPause: 'doona-lens-pause',
  sparklines: 'doona-sparklines',
  limitNotice: 'doona-limit-notice',
  flagOverrides: 'doona-flag-overrides',
  toastPlacement: 'doona-toast-placement',
  startPage: 'doona-start-page',
  dateFormat: 'doona-date-format',
  timeFormat: 'doona-time-format',
  latencyProbe: 'doona-latency-probe',
  profiles: 'doona-profiles',
  profile: 'doona-profile',
  // The single-backend settings from before profiles, read once to migrate them.
  legacyApi: 'doona-api',
  legacyToken: 'doona-api-token',
  // One key per backend and ring; see store/rings.ts.
  ringsPrefix: 'doona-rings-',
  connectionsView: 'doona-connections-view',
  activityGroup: 'doona-activity-group',
  // Each backend's policy groups folded or opened against their default; see features/policies/folds.ts.
  policyFolds: 'doona-policy-folds',
  // Whether the node grids list only available nodes, for every group; see features/policies/aliveOnly.ts.
  aliveOnly: 'doona-alive-only',
  gettingStarted: 'doona-getting-started',
  // The password session; see api/session.ts.
  session: 'doona-session',
  // sessionStorage
  saved: 'doona-saved',
  hubPages: 'doona-hub-pages'
} as const;
