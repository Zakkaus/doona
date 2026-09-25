import {expect, it} from 'vitest';
import {backendMessage} from './backend';
import {LANGS, translate, type Lang, type Translator} from './index';

// The codes honk sets on operation.error and provider.last_error, which the contract leaves to the adapter.
const operationCodes = [
  'reload_rejected',
  'reload_degraded',
  'engine_unavailable',
  'request_exhausted',
  'lifecycle_failed',
  'geodata_update_failed',
  'probe_interrupted',
  'probe_cleanup_failed',
  'publication_rejected',
  'fetch_failed',
  'provider_replaced',
  'result_too_large'
];

it.each(LANGS.map(([lang]) => lang))('translates every operation error code in %s', (lang: Lang) => {
  const t: Translator = (key, params) => translate(lang, key, params);
  for (const code of operationCodes) {
    const text = backendMessage(code, 'English message from the backend', t);
    expect(text, code).not.toContain('English message');
    expect(text, code).not.toContain('ui.backend.');
  }
});

it('falls back to the backend message for a code it does not know', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  expect(backendMessage('adapter_specific', 'Something specific', t)).toBe(t('ui.backendMessage', {message: 'Something specific'}));
});
