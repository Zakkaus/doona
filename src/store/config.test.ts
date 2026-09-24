import {expect, it} from 'vitest';
import {ApiError, LocalError} from '../api/error';
import {refusalOutcome} from './config';

const source = {id: 'main', content_sha256: 'aaa'};
const refused = new ApiError(412, 'precondition_failed', 'Precondition failed');

it('passes the 412 on and forgets nothing when the file changed or the refetch failed', () => {
  expect(refusalOutcome(refused, source, 'bbb', 'main:aaa')).toEqual({error: refused, lastRefused: 'main:aaa'});
  expect(refusalOutcome(refused, source, undefined, null)).toEqual({error: refused, lastRefused: null});
});

it('remembers the first refusal of an unchanged digest and reports the disk ahead on the second', () => {
  const first = refusalOutcome(refused, source, 'aaa', null);
  expect(first).toEqual({error: refused, lastRefused: 'main:aaa'});
  const second = refusalOutcome(refused, source, 'aaa', first.lastRefused);
  expect(second.error).toBeInstanceOf(LocalError);
  expect((second.error as LocalError).key).toBe('config.diskAhead');
  expect(second.lastRefused).toBe('main:aaa');
});

it('counts refusals per source and digest', () => {
  expect(refusalOutcome(refused, source, 'aaa', 'other:aaa')).toEqual({error: refused, lastRefused: 'main:aaa'});
  expect(refusalOutcome(refused, {id: 'main', content_sha256: 'ccc'}, 'ccc', 'main:aaa').error).toBe(refused);
});
