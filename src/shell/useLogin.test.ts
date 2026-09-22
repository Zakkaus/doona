import {expect, it} from 'vitest';
import {credentialProblem, loginProfiles, signInRefusal} from './useLogin';
import {ApiError} from '../api/error';
import {signInKind} from '../api/auth';

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

it('checks credentials against the backend limits before any attempt', () => {
  expect(credentialProblem('login', 'admin', 'correct horse battery', '')).toBeNull();
  expect(credentialProblem('login', 'ad min', 'correct horse battery', '')).toBe('login.badUsername');
  expect(credentialProblem('login', 'admin', 'short', '')).toBe('login.badPassword');
  // Twelve scalar values, not twelve UTF-16 units: an emoji counts once.
  expect(credentialProblem('login', 'admin', '😀'.repeat(12), '')).toBeNull();
  expect(credentialProblem('setup', 'admin', 'correct horse battery', 'correct horse batterx')).toBe('login.mismatch');
});

it('maps refusals by code and follows a moved account state', () => {
  expect(signInRefusal(new ApiError(401, 'invalid_credentials', 'x'))).toEqual({key: 'login.invalidCredentials'});
  expect(signInRefusal(new ApiError(409, 'setup_required', 'x'))?.switchTo).toBe('setup');
  expect(signInRefusal(new ApiError(409, 'setup_already_completed', 'x'))?.switchTo).toBe('login');
  expect(signInRefusal(new ApiError(429, 'rate_limited', 'x', null, null, 7))).toEqual({key: 'login.rateLimited', params: {n: 7}});
  expect(signInRefusal(new ApiError(500, 'internal', 'x'))).toBeNull();
  expect(signInKind(null)).toBe('token');
  expect(signInKind({mode: 'password', setup_required: true, anonymous_loopback: false})).toBe('setup');
  expect(signInKind({mode: 'password', setup_required: false, anonymous_loopback: false})).toBe('login');
});
