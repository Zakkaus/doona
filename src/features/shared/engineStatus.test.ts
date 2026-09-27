import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {engineStatus} from './engineStatus';
const t: Translator = (key, params) => translate('en', key, params);

it('adds a degraded or failed datapath to the engine status with the worse tone and a link to its card', () => {
  expect(engineStatus('running', 'active', '', t)).toEqual({tone: 'ok', text: t('lifecycle.running'), href: null});
  expect(engineStatus('running', 'degraded', '', t)).toEqual({
    tone: 'warn',
    text: t('ov.status.datapathDegraded', {status: t('lifecycle.running')}),
    href: '#/overview?card=datapath'
  });
  expect(engineStatus('reloading', 'failed', '', t)).toMatchObject({tone: 'err', text: t('ov.status.datapathFailed', {status: t('lifecycle.reloading')})});
  expect(engineStatus('failed', 'degraded', '', t).tone).toBe('err');
  expect(engineStatus(undefined, 'failed', t('ov.loading'), t)).toEqual({tone: 'warn', text: t('ov.loading'), href: null});
});
