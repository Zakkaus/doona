import {expect, it} from 'vitest';
import {enumLabel} from './enum';
import {translate, type Key, type Translator} from './index';
const t: Translator = (key, params) => translate('en', key, params);

it('names a known value and shows an unknown one as sent', () => {
  const labels: Record<string, Key> = {ok: 'ui.unknown'};
  expect(enumLabel(labels, 'ok', t)).toBe(t('ui.unknown'));
  expect(enumLabel(labels, 'added_later', t)).toBe('added_later');
  // Inherited names are values too, not labels.
  expect(enumLabel(labels, 'constructor', t)).toBe('constructor');
});
