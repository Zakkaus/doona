import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {LangContext, useT, type Lang, type Params} from './index';
import {modules, type Key} from './messages';

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
  expect(render('en', 'act.nTimeouts', {n: 1, list: '{n}'})).toBe('1 node timed out: {n}');
  expect(render('en', 'act.nTimeouts', {n: 2, list: 'edge-a, edge-b'})).toBe('2 nodes timed out: edge-a, edge-b');
  expect(render('zh-TW', 'act.nTimeouts', {n: 1, list: 'edge-a'})).toBe('1 個節點逾時：edge-a');
  expect(render('zh-CN', 'act.nTimeouts', {n: 2, list: 'edge-a、edge-b'})).toBe('2 个节点超时：edge-a、edge-b');
});

it('never overwrites a message from another module during merging', () => {
  const owners = new Set<string>();
  const duplicates: string[] = [];
  for (const module of modules) {
    for (const key of Object.keys(module['zh-TW'])) {
      if (owners.has(key)) duplicates.push(key);
      owners.add(key);
    }
  }
  expect(duplicates).toEqual([]);
});
