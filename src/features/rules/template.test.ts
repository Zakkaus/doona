import {expect, it} from 'vitest';
import type {ConfigSource} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {writeTemplate} from '../../dae/setup';
import {currentTemplate, routingSources, templatesView} from './template';

const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);
const source = (id: string, content: string, kind: ConfigSource['kind'] = 'include'): ConfigSource => ({
  id,
  path: `/etc/honk/${id}.dae`,
  kind,
  writable: true,
  loaded_at: '2026-09-30T00:00:00Z',
  content,
  content_sha256: '',
  bytes: content.length,
  line_count: 1
});

it('names the template the one routing file holds, in plain words', () => {
  const main = source('main', writeTemplate('group { proxy {} }\n', 'bypass', []), 'main');
  const view = templatesView([main, source('extra', 'node { a: "vless://x" }\n')], t);
  expect(view.current?.name).toBe('Bypass mainland China');
  expect(view.current?.help).toContain('Mainland China connects directly');
  expect(view.primary.map(choice => choice.id)).toEqual(['bypass', 'gfw', 'global']);
});

it('says which groups each of the ACL4SSR templates creates', () => {
  const view = templatesView([], t);
  expect(view.more.map(choice => choice.id)).toEqual(['mini', 'standard', 'full']);
  expect(view.more[0].help).toContain('Creates the groups proxy, auto.');
  expect(view.more[1].help).toContain('proxy, auto, telegram, media, apple');
});

it('reads routing split over files, or held by a generated file, as custom', () => {
  const bypass = writeTemplate('group { proxy {} }\n', 'bypass', []);
  expect(currentTemplate([source('main', bypass, 'main'), source('more', 'routing { fallback: proxy }\n')])).toBeNull();
  expect(routingSources([source('gen', bypass, 'generated')])).toEqual([]);
  expect(currentTemplate([source('main', bypass.replace('fallback: proxy', 'fallback: direct'), 'main')])).toBeNull();
});
