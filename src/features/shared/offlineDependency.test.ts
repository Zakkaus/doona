import {expect, it} from 'vitest';
import type {ConfigDiagnostic} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {diagnosticMessage} from '../../i18n/backend';
import {explainDiagnostic} from './offlineDependency';

it('explains each offline dependency code, naming the missing geodata file when known', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  const offline = (code: string) => ({code, message: 'required offline configuration dependency is unavailable'}) as ConfigDiagnostic;
  const codes = ['missing-offline-dependency', 'offline-dependency-denied', 'invalid-offline-dependency', 'unreadable-offline-dependency'];
  const summaries = codes.map(code => explainDiagnostic(offline(code), t));
  for (const message of summaries) {
    expect(message.detail).toBeUndefined();
    expect(message.summary).not.toContain('offline configuration dependency');
    expect(message.summary).toContain('geosite.dat');
    expect(message.summary).toContain('subscription or node file');
  }
  expect(new Set(summaries.map(message => message.summary)).size).toBe(codes.length);
  const precise = explainDiagnostic(offline('missing-offline-dependency'), t, 'geosite.dat').summary;
  expect(precise).toBe('A file the configuration needs was not found. Missing or unusable: geosite.dat.');
  for (const lang of ['zh-CN', 'zh-TW'] as const)
    expect(explainDiagnostic(offline('missing-offline-dependency'), (key, params) => translate(lang, key, params), 'geoip.dat').summary).toMatch(
      /^[^A-Za-z]+geoip\.dat。$/
    );
  // Any other code keeps its words as before.
  const other = {code: 'some-new-code', message: 'From the backend'} as ConfigDiagnostic;
  expect(explainDiagnostic(other, t, 'geosite.dat')).toEqual(diagnosticMessage(other, t));
});
