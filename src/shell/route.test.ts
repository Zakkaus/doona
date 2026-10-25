import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {hookHarness} from '../store/testHelpers';
import {buildHash, historyPosition, href, parseHash, pickTab, restoreDraftRoute, tabQuery, updateRoute} from './route';
import type {RoutePath} from './routes';

import {draftLabels, dropDrafts, useDraftGuard} from './draft';
import {translate} from '../i18n';

const draftContext = vi.hoisted(() => ({setDirty: vi.fn(), revision: 0, ask: vi.fn()}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  ...hookHarness.hooks,
  useContext: () => draftContext,
  useCallback: <T>(callback: T) => callback
}));

beforeEach(() => {
  hookHarness.reset();
  draftContext.setDirty.mockClear();
  draftContext.ask.mockClear();
  const events = new EventTarget();
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
});
afterEach(() => {
  hookHarness.unmount();
  dropDrafts(draftContext.setDirty);
  vi.unstubAllGlobals();
});

it('names two dirty owners and removes each label when its draft is cleared', () => {
  const [runtime, backend] = hookHarness.render(() => [
    useDraftGuard(true, vi.fn(), 'config.draftRuntime'),
    useDraftGuard(true, vi.fn(), 'config.draftBackend'),
    useDraftGuard(false, vi.fn(), 'config.draftRule')
  ]);
  hookHarness.runEffects();
  expect(draftLabels(draftContext.setDirty)).toEqual(['config.draftRuntime', 'config.draftBackend']);
  runtime.leave(vi.fn());
  expect(draftContext.ask).toHaveBeenCalledOnce();
  runtime.clear();
  expect(draftLabels(draftContext.setDirty)).toEqual(['config.draftBackend']);
  expect(draftContext.setDirty).toHaveBeenLastCalledWith(true);
  const action = vi.fn();
  backend.leave(action);
  expect(action).toHaveBeenCalledOnce();
  backend.clear();
  expect(draftLabels(draftContext.setDirty)).toEqual([]);
  expect(draftContext.setDirty).toHaveBeenLastCalledWith(false);
});

it('gives an unnamed dirty owner a neutral label in each locale', () => {
  hookHarness.render(() => useDraftGuard(true, vi.fn()));
  hookHarness.runEffects();
  expect(draftLabels(draftContext.setDirty)).toEqual(['config.draftOther']);
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
    const label = translate(lang, draftLabels(draftContext.setDirty)[0]);
    const text = translate(lang, 'config.discardHelp', {drafts: label});
    expect(text).toContain(label);
    expect(text).not.toContain(translate(lang, 'config.draftConfig'));
    expect(text).not.toContain('{drafts}');
  }
  dropDrafts(draftContext.setDirty);
  expect(draftLabels(draftContext.setDirty)).toEqual([]);
});

describe('draft history restoration', () => {
  it('restores an unindexed Back destination without traversing away from the draft', () => {
    const history = {state: null, go: vi.fn(), replaceState: vi.fn()};
    vi.stubGlobal('history', history);
    expect(restoreDraftRoute({route: 'config', query: 'source=main'}, 2)).toBeUndefined();
    expect(history.go).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith({doonaPosition: 2}, '', '#/config?source=main');
  });

  it('restores an indexed Back destination and returns its discard traversal', () => {
    const history = {state: {doonaPosition: 1}, go: vi.fn(), replaceState: vi.fn()};
    vi.stubGlobal('history', history);
    expect(restoreDraftRoute({route: 'config', query: ''}, 3)).toBe(-2);
    expect(history.go).toHaveBeenCalledWith(2);
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('reads the history position from an entry whose state the browser dropped', () => {
    vi.stubGlobal('history', {state: null});
    expect(historyPosition()).toBe(0);
    expect(historyPosition(3)).toBe(3);
    vi.stubGlobal('history', {state: {doonaPosition: 2}});
    expect(historyPosition()).toBe(2);
  });
});
describe('hash routing', () => {
  it('builds a link with encoded and omitted parameters', () => {
    expect(href('rules', {tab: 'list', rule: 'a & b', unused: null})).toBe('#/rules?tab=list&rule=a+%26+b');
  });

  it('picks an available tab and falls back from stale links', () => {
    expect(pickTab('tab=cache', ['query', 'cache'], 'query')).toBe('cache');
    expect(pickTab('tab=log', ['query', 'cache'], 'query')).toBe('query');
  });

  it.each([
    ['', 'activity', ''],
    ['#', 'activity', ''],
    ['#/', 'activity', ''],
    ['#/rules', 'rules', ''],
    ['#/rules?id=a&x=1', 'rules', 'id=a&x=1'],
    ['#rules?id=a', 'rules', 'id=a'],
    ['#/rules?next=/connections?src=192.168.1.2', 'rules', 'next=/connections?src=192.168.1.2'],
    ['#/flows', 'flows', ''],
    ['#/flows?path=rule%3Aa', 'flows', 'path=rule%3Aa'],
    ['#/flows?tab=records&id=flow-1', 'flows', 'tab=records&id=flow-1'],
    // The flow map and records moved off the rules page; the older flows page opened a selected record.
    ['#/flows?id=flow-1', 'flows', 'id=flow-1&tab=records'],
    ['#/flows?connection_id=1', 'flows', 'connection_id=1&tab=records'],
    ['#/rules?tab=map', 'flows', 'tab=map'],
    ['#/rules?tab=map&by=client&path=client%3A10.0.0.12', 'flows', 'tab=map&by=client&path=client%3A10.0.0.12'],
    ['#/rules?tab=flows', 'flows', 'tab=records'],
    ['#/rules?tab=flows&id=flow-1', 'flows', 'tab=records&id=flow-1'],
    ['#/rules?tab=flows&connection_id=1', 'flows', 'tab=records&connection_id=1'],
    ['#/rules?tab=flows&path=outbound%3Adirect', 'flows', 'tab=records&path=outbound%3Adirect'],
    ['#/rules?path=a', 'flows', 'path=a&tab=map'],
    ['#/rules?by=client', 'flows', 'by=client&tab=map'],
    ['#/rules?tab=list&rule=a', 'rules', 'tab=list&rule=a'],
    // The global settings card moved to the configuration page's global tab.
    ['#/settings?card=global', 'config', 'tab=global'],
    ['#/settings?card=global&source=main&section=1&field=log_level', 'config', 'source=main&section=1&field=log_level&tab=global'],
    ['#/settings?card=runtime', 'settings', 'card=runtime'],
    ['#/?id=a', 'activity', 'id=a']
  ])('parses %s', (hash, route, query) => {
    expect(parseHash(hash)).toEqual({route, query});
  });

  it('maps an unknown destination to Activity without retaining the invalid route', () => {
    expect(parseHash('#/unknown?id=a')).toEqual({route: 'activity', query: 'id=a'});
  });

  it.each<[RoutePath, string?]>([
    ['activity', undefined],
    ['rules', ''],
    ['rules', 'id=a&x=1'],
    ['connections', 'q=example?src=a%26b']
  ])('round-trips %s with query %s', (route, query) => {
    expect(buildHash(route, query)).toBe('#/' + route + (query ? '?' + query : ''));
    expect(parseHash(buildHash(route, query))).toEqual({route, query: query ?? ''});
  });

  it('updates both snapshots when only the query changes', () => {
    let state = parseHash('#/rules');
    state = updateRoute(state, '#/rules?id=a');
    expect(state).toEqual({route: 'rules', query: 'id=a'});
    state = updateRoute(state, '#/rules?id=b');
    expect(state).toEqual({route: 'rules', query: 'id=b'});
    state = updateRoute(state, '#/rules?id=a');
    expect(state).toEqual({route: 'rules', query: 'id=a'});
  });
});

it('keeps the default tab out of the address', () => {
  expect(tabQuery('tab=latency&q=a', 'list', 'list')).toBe('q=a');
  expect(tabQuery('q=a', 'latency', 'list')).toBe('q=a&tab=latency');
  expect(tabQuery('q=a', 'list', null)).toBe('q=a&tab=list');
});
