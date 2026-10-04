import type {Capabilities, RuntimeSettingField} from '../../api/model';
import type {Key} from '../../i18n';

// The page's cards in order. The page renders them in this order and search lists the same
// cards, so both take their titles from here; `?card=` scrolls to the card's heading, id `settings-{id}`.
export type SettingsCardId = 'backend' | 'runtime' | 'geodata' | 'appearance' | 'probes' | 'about';
// `aliases` are other words people search for a card by; every language's title matches already.
export const settingsCards: ReadonlyArray<{id: SettingsCardId; titleKey: Key; aliases?: readonly string[]}> = [
  {id: 'backend', titleKey: 'settings.backend'},
  {id: 'runtime', titleKey: 'settings.runtime'},
  {id: 'geodata', titleKey: 'settings.geodata', aliases: ['geodata', 'geoip', 'geosite']},
  {id: 'appearance', titleKey: 'settings.appearance'},
  {id: 'probes', titleKey: 'settings.probes'},
  {id: 'about', titleKey: 'settings.about'}
];
// The geodata card displays files whenever the backend offers them; source controls have their own capability gate.
export const settingsCardList = (resources: Capabilities['resources'] | undefined) =>
  settingsCards.filter(card => card.id !== 'geodata' || resources?.geodata.available);

export const cardHeadingId = (id: string) => `settings-${id}`;
export function settingsCard(id: SettingsCardId) {
  return {headingId: cardHeadingId(id), titleKey: settingsCards.find(card => card.id === id)!.titleKey};
}

// The controls search lands on, in card order. `?card={card}&field={id}` focuses the control inside the card's
// `data-setting="{id}"`; a control the page does not show leaves the card focused. The runtime card's fields are
// runtimeFieldLabels below, keyed by the runtime settings field. `sources` marks the geodata source controls, shown
// only where geodataConfigurable allows.
type SettingsFieldId =
  | 'profile'
  | 'addProfile'
  | 'renameProfile'
  | 'deleteProfile'
  | 'signOut'
  | 'api'
  | 'token'
  | 'test'
  | 'lang'
  | 'dateFormat'
  | 'timeFormat'
  | 'palette'
  | 'scheme'
  | 'wordmark'
  | 'toastPlacement'
  | 'startPage'
  | 'countryFlags'
  | 'sparklines'
  | 'mirrored'
  | 'probeMethod'
  | 'probeFamily'
  | 'probeWarmth'
  | 'probeMembers'
  | 'geodataSource'
  | 'geodataCustomUrls'
  | 'geodataRoute'
  | 'geodataChecksum'
  | 'geodataAutoUpdate'
  | 'geodataUpdate'
  | 'geodataReset';
export type SettingsField = {id: SettingsFieldId; card: SettingsCardId; labelKey: Key; aliases?: readonly string[]; sources?: true};
export const settingsFields: ReadonlyArray<SettingsField> = [
  {id: 'profile', card: 'backend', labelKey: 'settings.profile'},
  {id: 'addProfile', card: 'backend', labelKey: 'settings.addProfile'},
  {id: 'renameProfile', card: 'backend', labelKey: 'settings.renameProfile'},
  {id: 'deleteProfile', card: 'backend', labelKey: 'settings.deleteProfile'},
  {id: 'signOut', card: 'backend', labelKey: 'settings.signOut', aliases: ['logout', 'log out']},
  {id: 'api', card: 'backend', labelKey: 'ui.backendUrl', aliases: ['url', 'api']},
  {id: 'token', card: 'backend', labelKey: 'settings.token', aliases: ['password']},
  {id: 'test', card: 'backend', labelKey: 'settings.test'},
  {id: 'lang', card: 'appearance', labelKey: 'ui.lang', aliases: ['language', 'locale']},
  {id: 'dateFormat', card: 'appearance', labelKey: 'settings.dateFormat', aliases: ['date']},
  {id: 'timeFormat', card: 'appearance', labelKey: 'settings.timeFormat', aliases: ['clock', '12-hour', '24-hour', 'am pm']},
  {id: 'palette', card: 'appearance', labelKey: 'ui.palette', aliases: ['theme', 'color']},
  {id: 'scheme', card: 'appearance', labelKey: 'settings.scheme', aliases: ['dark mode', 'light mode']},
  {id: 'wordmark', card: 'appearance', labelKey: 'ui.wordmark'},
  {id: 'toastPlacement', card: 'appearance', labelKey: 'settings.toastPlacement', aliases: ['toast']},
  {id: 'startPage', card: 'appearance', labelKey: 'settings.startPage', aliases: ['start page', 'home page']},
  {id: 'countryFlags', card: 'appearance', labelKey: 'settings.countryFlags', aliases: ['flags']},
  {id: 'sparklines', card: 'appearance', labelKey: 'settings.sparklines', aliases: ['sparklines']},
  {id: 'mirrored', card: 'appearance', labelKey: 'settings.mirror', aliases: ['rtl']},
  {id: 'probeMethod', card: 'probes', labelKey: 'settings.probeMethod'},
  {id: 'probeFamily', card: 'probes', labelKey: 'settings.probeFamily', aliases: ['ipv4', 'ipv6']},
  {id: 'probeWarmth', card: 'probes', labelKey: 'settings.probeWarmth'},
  {id: 'probeMembers', card: 'probes', labelKey: 'settings.probeMembers'},
  {id: 'geodataSource', card: 'geodata', labelKey: 'settings.geodataSource', sources: true},
  {id: 'geodataCustomUrls', card: 'geodata', labelKey: 'settings.geodataCustomUrls', sources: true},
  {id: 'geodataRoute', card: 'geodata', labelKey: 'settings.geodataRoute', sources: true},
  {id: 'geodataChecksum', card: 'geodata', labelKey: 'settings.geodataVerifyChecksum', sources: true},
  {id: 'geodataAutoUpdate', card: 'geodata', labelKey: 'settings.geodataAutoUpdate', sources: true},
  {id: 'geodataUpdate', card: 'geodata', labelKey: 'settings.geodataUpdateNow'},
  {id: 'geodataReset', card: 'geodata', labelKey: 'settings.geodataReset'}
];

// The runtime card's field labels by runtime settings field, for the card and for search; the card shows the fields
// the backend lets it change.
export const runtimeFieldLabels = {
  'log.level': 'settings.logLevel',
  'log.buffered_records': 'settings.logBuffer',
  'dns_log.max_records': 'settings.dnsLogSize',
  'flows.max_flows': 'settings.flowsMax',
  'flows.retention_seconds': 'settings.flowsRetention',
  record_flows: 'settings.recordFlows',
  record_logs: 'settings.recordLogs',
  record_dns_log: 'settings.recordDnsLog'
} as const satisfies Record<Exclude<RuntimeSettingField, 'geodata'>, Key>;

// The sources section needs both the capability and geodata among the runtime settings fields.
export function geodataConfigurable(resources: Capabilities['resources'] | undefined): boolean {
  return (
    resources?.geodata.available === true &&
    resources.geodata.configurable_sources === true &&
    resources.runtime_settings.available &&
    (resources.runtime_settings.fields ?? []).includes('geodata')
  );
}
