import {expect, it} from 'vitest';
import {credentialProblems, loginProfiles, predatesAuth, signInRefusal} from './useLogin';
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

it('checks credentials against the backend limits before any attempt, per field', () => {
  expect(credentialProblems('login', 'admin', 'correct horse battery', '')).toEqual({});
  expect(credentialProblems('login', 'ad min', 'short', '')).toEqual({username: 'login.badUsername', password: 'login.passwordShort'});
  // Eight scalar values, not eight UTF-16 units: an emoji counts once.
  expect(credentialProblems('login', 'admin', '😀'.repeat(8), '')).toEqual({});
  expect(credentialProblems('login', 'admin', '😀'.repeat(7), '')).toEqual({password: 'login.passwordShort'});
  expect(credentialProblems('login', 'admin', 'x'.repeat(129), '')).toEqual({password: 'login.passwordLong'});
  expect(credentialProblems('setup', 'admin', 'correct horse battery', 'correct horse batterx')).toEqual({confirm: 'login.mismatch'});
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

it('takes only a missing or protected discovery for a backend that predates password login', () => {
  expect(predatesAuth(new ApiError(404, 'not_found', 'Not found'))).toBe(true);
  expect(predatesAuth(new ApiError(401, 'authentication_required', 'Token required'))).toBe(true);
  expect(predatesAuth(new SyntaxError('Unexpected token <'))).toBe(true);
  // A backend that cannot be reached or fails says nothing about its sign-in; the page asks to retry instead.
  expect(predatesAuth(new ApiError(0, 'network_error', 'Failed to fetch'))).toBe(false);
  expect(predatesAuth(new ApiError(502, '', 'Bad Gateway'))).toBe(false);
  expect(predatesAuth(new TypeError('Failed to fetch'))).toBe(false);
});
