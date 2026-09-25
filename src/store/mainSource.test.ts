import {expect, it} from 'vitest';
import {translate, type Translator} from '../i18n';
import {editProblem} from './mainSource';
import {LocalError} from '../api/error';

const t: Translator = (key, params) => translate('en', key, params);

it('reports every refused main-source write with one validation message and one failure prefix', () => {
  expect(editProblem({kind: 'invalid', errors: 2}, t)).toEqual({kind: 'negative', text: 'Validation found 2 errors; nothing written'});
  expect(editProblem({kind: 'failed', error: new Error('offline')}, t)).toEqual({kind: 'negative', text: 'Could not write the configuration: offline'});
  // An unknown outcome is not a failure, so it gets neither the failure prefix nor the failure tone.
  expect(editProblem({kind: 'failed', error: new LocalError('ui.operationUnknown')}, t)).toEqual({kind: 'neutral', text: t('ui.operationUnknown')});
  // A file written but not applied is not a failed write, so it does not get the write-failure prefix.
  expect(editProblem({kind: 'failed', error: new LocalError('ui.writtenNotApplied')}, t)).toEqual({kind: 'negative', text: t('ui.writtenNotApplied')});
  expect(editProblem({kind: 'ok'}, t)).toBeNull();
});
