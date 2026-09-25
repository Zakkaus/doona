import type {Capabilities} from '../../api/model';
import type {Key} from '../../i18n';

// The page's cards in order. Search lists the same cards, so the page takes its titles from here; `?card=` scrolls
// to the card's heading, id `settings-{id}`.
type SettingsCardId = 'backend' | 'runtime' | 'geodata' | 'actions' | 'appearance' | 'about';
export const settingsCards: ReadonlyArray<{id: SettingsCardId; titleKey: Key}> = [
  {id: 'backend', titleKey: 'settings.backend'},
  {id: 'runtime', titleKey: 'settings.runtime'},
  {id: 'geodata', titleKey: 'settings.geodata'},
  {id: 'actions', titleKey: 'settings.actions'},
  {id: 'appearance', titleKey: 'settings.appearance'},
  {id: 'about', titleKey: 'settings.about'}
];
// The cards the page shows for a backend: the geodata card only where its sources can be configured.
export const settingsCardList = (resources: Capabilities['resources'] | undefined) =>
  settingsCards.filter(card => card.id !== 'geodata' || geodataConfigurable(resources));
export const cardHeadingId = (id: string) => `settings-${id}`;
export function settingsCard(id: SettingsCardId) {
  return {headingId: cardHeadingId(id), titleKey: settingsCards.find(card => card.id === id)!.titleKey};
}

// The sources section needs both the capability and geodata among the runtime settings fields; without either the
// page keeps the plain geodata table in the backend actions card.
export function geodataConfigurable(resources: Capabilities['resources'] | undefined): boolean {
  return (
    resources?.geodata.available === true &&
    resources.geodata.configurable_sources === true &&
    resources.runtime_settings.available &&
    (resources.runtime_settings.fields ?? []).includes('geodata')
  );
}
