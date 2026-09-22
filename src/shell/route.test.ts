import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildHash, href, parseHash, pickTab, restoreDraftRoute, updateRoute} from './route';
import type {RoutePath} from './registry';

afterEach(() => vi.unstubAllGlobals());

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
    ['#/flows', 'rules', 'tab=map'],
    ['#/flows?id=flow-1', 'rules', 'id=flow-1&tab=flows'],
    ['#/flows?connection_id=1', 'rules', 'connection_id=1&tab=flows'],
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
