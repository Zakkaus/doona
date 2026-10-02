import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {LangContext, translate, useT, type Lang, type Params} from './index';
import type {Key} from './index';

function Message({messageKey, params}: {messageKey: Key; params: Params}) {
  return useT()(messageKey, params);
}

it('substitutes placeholders once and selects plural forms in the active language', () => {
  const render = (lang: Lang, key: Key, params: Params) =>
    renderToStaticMarkup(
      <LangContext.Provider value={lang}>
        <Message messageKey={key} params={params} />
      </LangContext.Provider>
    );
  expect(render('en', 'dns.deleted', {n: 1})).toBe('Deleted 1 cache entry');
  expect(render('en', 'dns.deleted', {n: 2})).toBe('Deleted 2 cache entries');
  expect(render('zh-TW', 'dns.deleted', {n: 1})).toBe('已刪除 1 筆快取項目');
  expect(render('zh-CN', 'dns.deleted', {n: 2})).toBe('已删除 2 条缓存项');
});

it.each<[Key, number | bigint, string]>([
  ['conn.filtersActive', 1, 'Filters, 1 applied'],
  ['dns.logLoaded', 2, '2 loaded; the export covers loaded records only'],
  ['nodes.latency.unavailableList', 1000n, '1,000 unavailable: a, {n}'],
  ['nodes.latency.unmeasuredList', 0, '0 not measured: a, {n}']
])('interpolates the single English form of %s', (key, n, expected) => {
  expect(translate('en', key, {n, names: 'a, {n}'})).toBe(expected);
});

it.each<['zh-TW' | 'zh-CN', string]>([
  ['zh-TW', '更新訂閱'],
  ['zh-CN', '更新订阅']
])('labels subscription updates without implying multiple subscriptions in %s', (lang, label) => {
  for (const n of [0, 1, 2]) expect(translate(lang, 'settings.refreshAll', {n})).toBe(`${label}（${n}）`);
});
