import {expect, it} from 'vitest';
import {normalizeResourceKey} from '../inflight';
import {createMockApi} from '../mock';
import {recall, remember} from './resource';

it('evicts the oldest of 33 parameterised entries without evicting an unparameterised resource', () => {
  const api = createMockApi();
  const version = normalizeResourceKey(['version']);
  remember(api, version, 'version', false);
  for (let id = 0; id < 33; id++) remember(api, normalizeResourceKey(['flow', {id}]), id, true);
  expect(recall(api, normalizeResourceKey(['flow', {id: 0}]))).toBeUndefined();
  for (let id = 1; id < 33; id++) expect(recall(api, normalizeResourceKey(['flow', {id}]))).toBe(id);
  expect(recall(api, version)).toBe('version');
});

it('refreshes recency on reads and writes without counting an overwrite twice', () => {
  const api = createMockApi();
  for (let id = 0; id < 32; id++) remember(api, normalizeResourceKey(['flow', {id}]), id, true);
  expect(recall(api, normalizeResourceKey(['flow', {id: 0}]))).toBe(0);
  remember(api, normalizeResourceKey(['flow', {id: 1}]), 'updated', true);
  expect(recall(api, normalizeResourceKey(['flow', {id: 2}]))).toBe(2);
  remember(api, normalizeResourceKey(['flow', {id: 32}]), 32, true);
  expect(recall(api, normalizeResourceKey(['flow', {id: 3}]))).toBeUndefined();
  expect(recall(api, normalizeResourceKey(['flow', {id: 0}]))).toBe(0);
  expect(recall(api, normalizeResourceKey(['flow', {id: 1}]))).toBe('updated');
  expect(recall(api, normalizeResourceKey(['flow', {id: 2}]))).toBe(2);
});

it('keeps each backend’s capacity and responses independent', () => {
  const first = createMockApi();
  const second = createMockApi();
  for (let id = 0; id < 32; id++) {
    const name = normalizeResourceKey(['flow', {id}]);
    remember(first, name, `first:${id}`, true);
    remember(second, name, `second:${id}`, true);
  }
  remember(first, normalizeResourceKey(['flow', {id: 32}]), 'first:32', true);
  expect(recall(first, normalizeResourceKey(['flow', {id: 0}]))).toBeUndefined();
  for (let id = 0; id < 32; id++) expect(recall(second, normalizeResourceKey(['flow', {id}]))).toBe(`second:${id}`);
  expect(recall(second, normalizeResourceKey(['flow', {id: 32}]))).toBeUndefined();
});
