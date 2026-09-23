import {expect, it} from 'vitest';
import {translate, type Translator} from '../i18n';
import {editProblem} from './mainSource';

const t: Translator = (key, params) => translate('en', key, params);

it('reports every refused main-source write with one validation message and one failure prefix', () => {
  expect(editProblem({kind: 'invalid', errors: 2}, t)).toBe('Validation found 2 errors; nothing written');
  expect(editProblem({kind: 'failed', error: new Error('offline')}, t)).toBe('Could not write the configuration: offline');
  expect(editProblem({kind: 'ok'}, t)).toBeNull();
});
