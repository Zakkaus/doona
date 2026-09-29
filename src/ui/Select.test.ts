import {expect, it} from 'vitest';
import {translate, type Translator} from '../i18n';
import {chosen, type ChoiceSection} from './Select';

it('uses a whole message for a choice shared by several sections', () => {
  const sections: ChoiceSection[] = [
    {title: 'Protocol', items: [{id: 'tcp', label: 'TCP'}], value: 'tcp'},
    {title: 'Network', items: [{id: 'udp', label: 'UDP'}], value: 'udp'}
  ];
  expect(chosen(sections, (key, params) => translate('en', key, params))).toBe('Protocol TCP');
  // A language that names the item first can say so.
  const itemFirst: Translator = (key, params) => (key === 'ui.sectionChoice' ? `${params?.item} (${params?.section})` : translate('en', key, params));
  expect(chosen(sections, itemFirst)).toBe('TCP (Protocol)');
  expect(chosen(sections.slice(0, 1), (key, params) => translate('en', key, params))).toBe('TCP');
});
