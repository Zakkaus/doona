import {expect, it} from 'vitest';
import {languages} from '../../i18n';
import {DOCS_URL, docsHref} from './docs';

it('links the page that holds the anchor, in the UI language', () => {
  expect(docsHref('zh-TW', 'no-native-api')).toBe('https://zakkaus.github.io/doona-docs/zh-TW/troubleshooting.html#no-native-api');
  expect(docsHref('zh-CN', 'install')).toBe(`${DOCS_URL}zh-CN/install.html#install`);
  expect(docsHref('en', 'config')).toBe(`${DOCS_URL}en/configuration.html#config`);
});

it('links the docs home without an anchor', () => {
  expect(docsHref('zh-TW')).toBe(`${DOCS_URL}zh-TW/`);
  expect(docsHref('en')).toBe(`${DOCS_URL}en/`);
});

it('links each language to a docs folder the docs site has', () => {
  for (const {id} of languages) expect(docsHref(id)).toMatch(new RegExp(`^${DOCS_URL}(zh-TW|zh-CN|en)/$`));
});
