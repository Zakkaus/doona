import {describe, expect, it} from 'vitest';
import {buildHash, parseHash, updateRoute} from './route';

describe('hash routing', () => {
  it.each([
    ['', 'overview', ''],
    ['#', 'overview', ''],
    ['#/', 'overview', ''],
    ['#/flows', 'flows', ''],
    ['#/flows?id=a&x=1', 'flows', 'id=a&x=1'],
    ['#flows?id=a', 'flows', 'id=a'],
    ['#/flows?next=/connections?src=192.168.1.2', 'flows', 'next=/connections?src=192.168.1.2'],
    ['#/?id=a', 'overview', 'id=a'],
    ['#/unknown?id=a', 'unknown', 'id=a']
  ])('parses %s', (hash, route, query) => {
    expect(parseHash(hash)).toEqual({route, query});
  });

  it.each<[string, string?]>([
    ['overview', undefined],
    ['flows', ''],
    ['flows', 'id=a&x=1'],
    ['connections', 'q=example?src=a%26b']
  ])('round-trips %s with query %s', (route, query) => {
    expect(buildHash(route, query)).toBe('#/' + route + (query ? '?' + query : ''));
    expect(parseHash(buildHash(route, query))).toEqual({route, query: query ?? ''});
  });

  it('updates both snapshots when only the query changes', () => {
    let state = parseHash('#/flows');
    state = updateRoute(state, '#/flows?id=a');
    expect(state).toEqual({route: 'flows', query: 'id=a'});
    state = updateRoute(state, '#/flows?id=b');
    expect(state).toEqual({route: 'flows', query: 'id=b'});
    state = updateRoute(state, '#/flows?id=a');
    expect(state).toEqual({route: 'flows', query: 'id=a'});
  });
});
