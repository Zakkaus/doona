import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {RoutingRule} from '../api/model';
import type {PendingRule} from './pendingRules';

const before = {rule_id: 'r1', index: 0, expression: 'dip(1.1.1.1)', outbound: 'direct', must: false, source: null, kind: 'rule'} as RoutingRule;
const held: Omit<PendingRule, 'id'> = {condition: 'dip(9.9.9.9)', outbound: 'proxy', must: false, before, sourceId: 'src-main'};
// A fresh store per test, loaded where the page's unload event can be seen.
const load = async () => {
  vi.resetModules();
  return (await import('./pendingRules')).pendingRules;
};
beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

it('drops a failure once a held rule leaves, but not for rules that were never held', async () => {
  const store = await load();
  store.add(held);
  store.add(held);
  const [first, second] = store.snapshot().rules;
  store.fail({text: 'refused', lines: ['config.dae line 3']});
  store.remove([first.id + second.id + 1]);
  expect(store.snapshot().failure).toEqual({text: 'refused', lines: ['config.dae line 3']});
  store.remove([first.id]);
  expect(store.snapshot().failure).toBeNull();
  expect(store.snapshot().rules.map(rule => rule.id)).toEqual([second.id]);
});

it('lets one apply run at a time', async () => {
  const store = await load();
  expect(store.begin()).toBe(true);
  expect(store.begin()).toBe(false);
  expect(store.snapshot().applying).toBe(true);
  store.end();
  expect(store.begin()).toBe(true);
});

it('asks before the page is left while rules are held', async () => {
  const store = await load();
  const leave = () => {
    const event = new Event('beforeunload', {cancelable: true});
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(leave()).toBe(false);
  store.add(held);
  expect(leave()).toBe(true);
  store.remove([store.snapshot().rules[0].id]);
  expect(leave()).toBe(false);
});
