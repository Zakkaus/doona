import {expect, it} from 'vitest';
import {ApiError, LocalError} from '../api/error';
import {closestLimit, refusalOutcome, withinLimits} from './config';

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

it('finds the advertised limit a write uses most of, measuring content in UTF-8 bytes and the body as JSON', () => {
  expect(closestLimit({content: 4, body: 100}, 'ab', {content: 'ab'})).toEqual({limit: 4, exceeded: false});
  expect(closestLimit({content: 4, body: 100}, 'äää', {content: 'äää'})).toEqual({limit: 4, exceeded: true});
  const quotes = '"'.repeat(6);
  expect(closestLimit({content: 100, body: 20}, quotes, {content: quotes})).toEqual({limit: 20, exceeded: true});
  expect(closestLimit({}, 'x'.repeat(1000), {content: 'x'.repeat(1000)})).toBeUndefined();
});

it('refuses a write over a limit before sending it and names that limit', async () => {
  let sent = false;
  const quotes = '"'.repeat(600);
  const refusal = await withinLimits({content: 1000, body: 1100}, quotes, {content: quotes}, async () => (sent = true)).catch((error: unknown) => error);
  expect(sent).toBe(false);
  expect((refusal as ApiError).text).toEqual({key: 'config.tooLarge', params: {limit: 1100}});
});

it('names the limit a 413 most likely hit, which is not always the smaller one, and leaves other failures as sent', async () => {
  const refused = new ApiError(413, 'request_too_large', 'Request body exceeds its limit');
  const reject = (error: ApiError) => () => Promise.reject(error);
  // Escaping makes 500 quotes a 1,014-byte body: closer to its 1,100 limit than the 500 bytes of text to theirs.
  const quotes = '"'.repeat(500);
  const named = await withinLimits({content: 1000, body: 1100}, quotes, {content: quotes}, reject(refused)).catch((error: unknown) => error);
  expect((named as ApiError).text).toEqual({key: 'config.tooLarge', params: {limit: 1100}});
  expect(await withinLimits({}, 'x', {content: 'x'}, reject(refused)).catch((error: unknown) => error)).toBe(refused);
  const other = new ApiError(422, 'unsupported_value', 'Invalid');
  expect(await withinLimits({body: 65536}, 'x', {content: 'x'}, reject(other)).catch((error: unknown) => error)).toBe(other);
});
