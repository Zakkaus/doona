import {expect, it} from 'vitest';
import {ApiError, LocalError} from '../api/error';
import {exceededLimit, refusalOutcome, sizeRefusal} from './config';

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

it('names the limit a write exceeds: the content in UTF-8 bytes, then the JSON body with its escaping', () => {
  expect(exceededLimit({content: 4, body: 100}, 'ab', {content: 'ab'})).toBeUndefined();
  expect(exceededLimit({content: 4, body: 100}, 'äää', {content: 'äää'})).toBe(4);
  expect(exceededLimit({content: 100, body: 20}, '"'.repeat(6), {content: '"'.repeat(6)})).toBe(20);
  expect(exceededLimit({}, 'x'.repeat(1000), {content: 'x'.repeat(1000)})).toBeUndefined();
});

it('turns a 413 into the tighter advertised limit and leaves everything else as sent', () => {
  const refused = new ApiError(413, 'request_too_large', 'Request body exceeds its limit');
  const named = sizeRefusal(refused, {content: 8388608, body: 65536});
  expect(named).toBeInstanceOf(ApiError);
  expect((named as ApiError).text).toEqual({key: 'config.tooLarge', params: {limit: 65536}});
  expect(sizeRefusal(refused, {})).toBe(refused);
  const other = new ApiError(422, 'unsupported_value', 'Invalid');
  expect(sizeRefusal(other, {body: 65536})).toBe(other);
});
