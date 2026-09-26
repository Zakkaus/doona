// Every key doona keeps in localStorage and sessionStorage. Browsers already hold these strings, so a value never
// changes: a renamed key would lose what readers saved. The mock backend's development switches are its own.
export const storageKeys = {
  lang: 'doona-lang',
  scheme: 'doona-scheme',
  palette: 'doona-palette',
  wordmark: 'doona-wordmark',
  mirror: 'doona-mirror',
  profiles: 'doona-profiles',
  profile: 'doona-profile',
  // The single-backend settings from before profiles, read once to migrate them.
  legacyApi: 'doona-api',
  legacyToken: 'doona-api-token',
  // One key per backend and ring; see rings.ts.
  ringsPrefix: 'doona-rings-',
  connectionsView: 'doona-connections-view',
  // sessionStorage
  session: 'doona-session',
  saved: 'doona-saved',
  hubPages: 'doona-hub-pages'
} as const;
