import {describe, expect, it} from 'vitest';
import {nodeFixtures} from '../../../../mock/fixtures';
import {translate, type Translator} from '../../../i18n';
import {memberSections} from '../../shared/groupText';
import {draftMembers} from './draftMembers';

describe('draft members', () => {
  const t: Translator = (key, params) => translate('en', key, params);
  const {nodes} = nodeFixtures(0, true);
  const hk = nodes.find(node => node.name === 'hk-01')!;
  const sg = nodes.find(node => node.name === 'sg-01')!;
  const input = [
    {...hk, subscription_tag: 'asia'},
    {...sg, subscription_tag: 'other'}
  ];
  it('offers draft members from name, subscription and nested group filters', () => {
    expect(draftMembers(["subtag(asia) && name(keyword: 'hk')", 'group(relay)'], input, t).map(member => member.name)).toEqual(['relay', 'hk-01']);
    const members = draftMembers(["subtag(asia) && name(keyword: 'hk')", 'group(relay)'], input, t);
    expect(memberSections(members, [], t)[1].items.map(member => member.nodeName)).toEqual([false, true]);
    expect(draftMembers(['name(sg-01)'], input, t).map(member => member.name)).toEqual(['sg-01']);
    expect(draftMembers(['group(relay)'], input, t)).toEqual([{name: 'relay', nodeName: false, status: {text: '', badge: t('ui.group')}}]);
  });
  it('offers draft members from regex filters as honk reads them', () => {
    expect(draftMembers(["name(regex: '(?i)^HK-\\d+$')"], input, t).map(member => member.name)).toEqual(['hk-01']);
    expect(draftMembers(["subtag(regex: '^(asia|other)$') && !name(regex: '^sg')"], input, t).map(member => member.name)).toEqual(['hk-01']);
    expect(draftMembers(["name(regex: '\\p{Han}')", "name(keyword: 'sg')"], input, t).map(member => member.name)).toEqual(['sg-01']);
    // A pattern honk cannot read drops its line, as honk does.
    expect(draftMembers(["name(regex: '(?<=x)hk')", 'name(sg-01)'], input, t).map(member => member.name)).toEqual(['sg-01']);
  });
});
