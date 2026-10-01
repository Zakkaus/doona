import {describe, expect, it} from 'vitest';
import type {Capabilities} from '../../api/model';
import {capabilities, capabilitiesBase} from '../../api/mock/fixtures/capabilities';
import {geodataConfigurable, settingsCardList} from './nav';

describe('capability', () => {
  it('lists the cards in page order', () => {
    expect(settingsCardList(capabilities.resources).map(card => card.id)).toEqual(['backend', 'runtime', 'geodata', 'appearance', 'actions', 'about']);
  });

  it('omits backend actions when no operation or legacy geodata table remains', () => {
    const resources = structuredClone(capabilities.resources);
    resources.operations.available = false;
    resources.dns_cache.flush = false;
    resources.providers.can_refresh = false;
    resources.connections.can_close = false;
    resources.geodata.available = false;
    expect(settingsCardList(resources).map(card => card.id)).not.toContain('actions');
  });

  it('shows the geodata card only with configurable sources and the geodata settings field', () => {
    expect(geodataConfigurable(capabilities.resources)).toBe(true);
    expect(settingsCardList(capabilities.resources).map(card => card.id)).toContain('geodata');
    const without: Capabilities['resources'] = {...capabilities.resources, geodata: {available: true, can_update: true, assets: ['geosite', 'geoip']}};
    expect(geodataConfigurable(without)).toBe(false);
    expect(settingsCardList(without).map(card => card.id)).not.toContain('geodata');
    expect(geodataConfigurable({...capabilities.resources, runtime_settings: {available: true, fields: ['log.level']}})).toBe(false);
    expect(geodataConfigurable(capabilitiesBase.resources)).toBe(false);
  });
});
