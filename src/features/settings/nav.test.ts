import {describe, expect, it} from 'vitest';
import type {Capabilities} from '../../api/model';
import {capabilities, capabilitiesBase} from '../../api/mock/fixtures/capabilities';
import {geodataConfigurable, settingsCardList} from './nav';

describe('capability', () => {
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
