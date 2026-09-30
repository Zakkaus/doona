import {expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {translate, type Translator} from '../../i18n';
import {draftMembers} from './groupText';

const t: Translator = (key, params) => translate('en', key, params);
it('offers draft members from name, subscription and nested group filters', () => {
  const {nodes} = nodeFixtures(0, true);
  const hk = nodes.find(node => node.name === 'hk-01')!;
  const sg = nodes.find(node => node.name === 'sg-01')!;
  const input = [
    {...hk, subscription_tag: 'asia'},
    {...sg, subscription_tag: 'other'}
  ];
  expect(draftMembers(["subtag(asia) && name(keyword: 'hk')", 'group(relay)'], input, t).map(member => member.name)).toEqual(['relay', 'hk-01']);
  expect(draftMembers(['name(sg-01)'], input, t).map(member => member.name)).toEqual(['sg-01']);
  expect(draftMembers(['group(relay)'], input, t)).toEqual([{name: 'relay', status: {text: t('ui.group'), badge: true}}]);
});
