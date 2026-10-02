import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import type {GroupSelectionResult} from '../../api/model';
import {selectionNotice} from './selectMember';

const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);

it.each([
  [{source: 'override', connections_interrupted: true}, t('policy.pinned', {name: 'proxy', member: 'tokyo'})],
  [{source: 'policy', connections_interrupted: true}, t('policy.selectedInterrupted', {name: 'proxy', member: 'tokyo'})],
  [{source: 'policy', connections_interrupted: false}, t('policy.selectedKept', {name: 'proxy', member: 'tokyo'})]
])('reports where a selection went (%o)', (result, text) => {
  expect(selectionNotice({member_id: 'n1', ...result} as unknown as GroupSelectionResult, 'proxy', 'tokyo', t)).toBe(text);
});
