import type {Capabilities} from '../../api/model';
import type {Key} from '../../i18n';

// The page's cards in order. The page renders them in this order and search lists the same
// cards, so both take their titles from here; `?card=` scrolls to the card's heading, id `settings-{id}`.
export type SettingsCardId = 'backend' | 'runtime' | 'geodata' | 'appearance' | 'probes' | 'about';
export const settingsCards: ReadonlyArray<{id: SettingsCardId; titleKey: Key}> = [
  {id: 'backend', titleKey: 'settings.backend'},
  {id: 'runtime', titleKey: 'settings.runtime'},
  {id: 'geodata', titleKey: 'settings.geodata'},
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

// The sources section needs both the capability and geodata among the runtime settings fields.
export function geodataConfigurable(resources: Capabilities['resources'] | undefined): boolean {
  return (
    resources?.geodata.available === true &&
    resources.geodata.configurable_sources === true &&
    resources.runtime_settings.available &&
    (resources.runtime_settings.fields ?? []).includes('geodata')
  );
}
