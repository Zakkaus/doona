import {expect, it} from 'vitest';
import {guideAnchors, guideHref, guideSectionId, isGuideAnchor} from './guide';
import {parseHash} from '../../shell/route';

it('keeps the anchor ids other pages link to', () => {
  expect(guideAnchors).toEqual([
    'requirements',
    'install',
    'config',
    'doona',
    'features',
    'operation',
    'troubleshooting',
    'state-db',
    'still-missing',
    'read-only',
    'unknown-setting',
    'no-native-api',
    'sign-in'
  ]);
  expect(guideHref('config')).toBe('#/guide?section=config');
  expect(guideHref()).toBe('#/guide');
  expect(parseHash(guideHref('state-db'))).toEqual({route: 'guide', query: 'section=state-db'});
  expect(guideSectionId('config')).toBe('guide-config');
  expect(isGuideAnchor('read-only')).toBe(true);
  expect(isGuideAnchor('nope')).toBe(false);
  expect(isGuideAnchor(null)).toBe(false);
});
