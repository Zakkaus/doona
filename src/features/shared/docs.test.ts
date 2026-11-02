import {expect, it} from 'vitest';
import {languages} from '../../i18n';
import {docsHref} from './docs';
import {manualHref} from './manualUrl';

it('links the page that holds the anchor, in the UI language', () => {
  expect(docsHref('zh-TW', 'no-native-api')).toBe('https://daeuniverse.org/zh-TW/doona/troubleshooting#no-native-api');
  expect(docsHref('zh-CN', 'install')).toBe('https://daeuniverse.org/zh-CN/doona/install#install');
  expect(docsHref('en', 'config')).toBe('https://daeuniverse.org/doona/configuration#config');
});

it('links the manual home without an anchor', () => {
  expect(docsHref('zh-TW')).toBe('https://daeuniverse.org/zh-TW/doona/');
  expect(docsHref('en')).toBe('https://daeuniverse.org/doona/');
});

it('links each language to a manual locale the site has', () => {
  for (const {id} of languages) expect(docsHref(id)).toMatch(/^https:\/\/daeuniverse\.org(\/zh-CN|\/zh-TW)?\/doona\/$/);
});

it('builds the same links for lite, which names the locale directly', () => {
  expect(manualHref('zh-CN', 'no-native-api')).toBe('https://daeuniverse.org/zh-CN/doona/troubleshooting#no-native-api');
  expect(manualHref('en')).toBe('https://daeuniverse.org/doona/');
});
