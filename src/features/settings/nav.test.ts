import {describe, expect, it} from 'vitest';
import type {Capabilities} from '../../api/model';
import {capabilities, capabilitiesBase} from '../../../mock/fixtures/capabilities';
import {geodataConfigurable, settingsCardList, settingsTab} from './nav';

describe('capability', () => {
  it('shows available geodata files while gating source controls on configurable runtime settings', () => {
    expect(geodataConfigurable(capabilities.resources)).toBe(true);
    expect(settingsCardList(capabilities.resources).map(card => card.id)).toContain('geodata');
    const without: Capabilities['resources'] = {...capabilities.resources, geodata: {available: true, can_update: true, assets: ['geosite', 'geoip']}};
    expect(geodataConfigurable(without)).toBe(false);
    expect(settingsCardList(without).map(card => card.id)).toContain('geodata');
    expect(geodataConfigurable({...capabilities.resources, runtime_settings: {available: true, fields: ['log.level']}})).toBe(false);
    expect(geodataConfigurable(capabilitiesBase.resources)).toBe(false);
    expect(settingsCardList({...capabilities.resources, geodata: {available: false}}).map(card => card.id)).not.toContain('geodata');
    expect(settingsCardList(undefined).map(card => card.id)).not.toContain('geodata');
  });
});

describe('tabs', () => {
  it('opens the tab of a linked card, else the one asked for, else General', () => {
    expect(settingsTab('')).toBe('general');
    expect(settingsTab('tab=appearance')).toBe('appearance');
    expect(settingsTab('tab=unknown')).toBe('general');
    expect(settingsTab('card=appearance&field=palette')).toBe('appearance');
    expect(settingsTab('tab=appearance&card=backend')).toBe('general');
  });
});
