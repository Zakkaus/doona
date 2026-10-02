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

it.each<[Key, string, string, string, string]>([
  ['settings.refreshAll', 'Update {n} subscription', 'Update {n} subscriptions', '更新 {n} 個訂閱', '更新 {n} 个订阅'],
  ['rule.applyPending', 'Apply {n} rule', 'Apply {n} rules', '套用 {n} 條規則', '应用 {n} 条规则'],
  ['toast.showAllCount', 'Show all {n} notification', 'Show all {n} notifications', '顯示全部 {n} 則通知', '显示全部 {n} 条通知'],
  ['conn.groupCount', 'Example, {n} connection', 'Example, {n} connections', 'Example，{n} 條連線', 'Example，{n} 条连接'],
  ['group.subscriptionCount', 'Example, {n} node', 'Example, {n} nodes', 'Example，{n} 個節點', 'Example，{n} 个节点'],
  ['dns.chart.speed', 'Upstream latency for {n} lookup', 'Upstream latency for {n} lookups', '{n} 筆上游查詢的延遲', '{n} 条上游查询的延迟']
])('writes the count into the label with locale plurals for %s', (key, one, other, tw, cn) => {
  for (const n of [0, 1, 3])
    for (const [lang, expected] of [
      ['en', n === 1 ? one : other],
      ['zh-TW', tw],
      ['zh-CN', cn]
    ] as const)
      expect(translate(lang, key, {n, name: 'Example'})).toBe(expected.replace('{n}', String(n)));
});
