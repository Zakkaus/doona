import {expect, it} from 'vitest';
import type {Lang} from '../../i18n';
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

it('falls back to English for a UI language the docs do not have', () => {
  expect(docsHref('ja' as Lang, 'sign-in')).toBe(`${DOCS_URL}en/troubleshooting.html#sign-in`);
});
