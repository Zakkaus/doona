import {expect, it} from 'vitest';
import {loginProfiles} from './useLogin';

const challenged = {id: 'router', name: 'Router', api: 'https://router.test/api-prefix', token: ''};

it('rejects a removed or repointed profile without changing its credentials', () => {
  const repointed = {...challenged, api: 'https://other.test', token: 'other-secret'};
  expect(loginProfiles([repointed], challenged.id, challenged.api, 'secret')).toBeNull();
  expect(repointed.token).toBe('other-secret');
  expect(loginProfiles([{...challenged, id: 'replacement'}], challenged.id, challenged.api, 'secret')).toBeNull();
});

it('updates only the challenged endpoint, preserving concurrent profile changes', () => {
  const renamed = {...challenged, name: 'Renamed'};
  const other = {...challenged, id: 'other', token: 'other-secret'};
  expect(loginProfiles([renamed, other], challenged.id, challenged.api + '/', ' secret ')).toEqual([{...renamed, token: 'secret'}, other]);
  expect(renamed.token).toBe('');
});
