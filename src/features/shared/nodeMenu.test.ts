import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
const t: Translator = (key, params) => translate('en', key, params);
import {menuViews} from './nodeMenu';

it('describes unmeasured and failed nodes and sorts each region by latency', () => {
  const menu = menuViews([{name: 'unknown'}, {name: 'down', alive: false, tcp: 5}, {name: 'fast', tcp: 0}], t);
  expect(menu.items.map(item => item.description)).toEqual(['—', t('ui.unavailable'), '0 ms']);
  expect(menu.sections[0].items.map(item => item.id)).toEqual(['fast', 'down', 'unknown']);
});
