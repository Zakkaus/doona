import {expect, it} from 'vitest';
import {geodata, runtimeSettings} from '../../api/mock/fixtures';
import type {RuntimeSettingsPatch} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {numericAccess, numericFieldView, geodataRows, profileView, paletteLabel} from './view';
const t: Translator = (key, params) => translate('en', key, params);
it('validates numeric bounds and writes typed partial patches without losing sibling edits', () => {
  expect(numericFieldView('flows.max_flows', '63', 128, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.max_flows', '128', 128, 'en-US', t).invalid).toBe(false);
  expect(numericFieldView('flows.max_flows', '129', 128, 'en-US', t).invalid).toBe(true);
  expect(numericFieldView('flows.retention_seconds', '1.5', undefined, 'en-US', t).invalid).toBe(true);
  const patch: RuntimeSettingsPatch = {log: {level: 'debug'}};
  numericAccess['log.buffered_records'].write(patch, 128);
  numericAccess['flows.max_flows'].write(patch, 256);
  numericAccess['flows.retention_seconds'].write(patch, 10);
  numericAccess['dns_log.max_records'].write(patch, 64);
  expect(patch).toEqual({log: {level: 'debug', buffered_records: 128}, flows: {max_flows: 256, retention_seconds: 10}, dns_log: {max_records: 64}});
  expect(numericAccess['log.buffered_records'].read(runtimeSettings)).toBe(1024);
});
it('keeps full geodata digests in tooltips and handles absent provenance', () => {
  const rows = geodataRows([{...geodata.assets[0], modified_at: null, source_redacted: null}], 'en-US');
  expect(rows[0]).toMatchObject({sha: geodata.assets[0].sha256.slice(0, 12), shaTitle: geodata.assets[0].sha256, source: '—', modifiedTitle: undefined});
});
it('distinguishes connection errors from successful status and falls back for unknown palettes', () => {
  const view = profileView([{id: 'a', name: 'Home'}], {key: 'settings.httpError', params: {status: 503}, error: true, requestId: 'req-1'}, t);
  expect(view.choices).toEqual([{id: 'a', label: 'Home'}]);
  expect(view.result).toMatchObject({role: 'alert', error: true});
  expect(view.result?.text).toContain('503');
  expect(view.result?.request).toContain('req-1');
  expect(profileView([], null, t).result).toBeNull();
  expect(paletteLabel([{items: [{id: 'a', label: 'Amber'}]}], 'a')).toBe('Amber');
  expect(paletteLabel([], 'custom')).toBe('custom');
});
