import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {LangContext, useT, type Lang, type Params} from './index';
import type {Key} from './messages';

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
  expect(render('zh-TW', 'dns.deleted', {n: 1})).toBe('已刪除 1 筆快取');
  expect(render('zh-CN', 'dns.deleted', {n: 2})).toBe('已删除 2 条缓存');
});
