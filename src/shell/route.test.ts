import {describe, expect, it} from 'vitest';
import {buildHash, parseHash, updateRoute} from './route';

describe('hash routing', () => {
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
    ['#/?id=a', 'activity', 'id=a'],
    ['#/unknown?id=a', 'unknown', 'id=a']
  ])('parses %s', (hash, route, query) => {
    expect(parseHash(hash)).toEqual({route, query});
  });

  it.each<[string, string?]>([
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
