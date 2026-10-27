import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {capabilities} from '../../../mock/fixtures/capabilities';
import {connectionStartup} from '../src/connectionStartup';
import {ApiError} from '../../../src/api/error';

const loc = {origin: 'https://honk.example', pathname: '/router/ui/', protocol: 'https:'};
const address = 'https://honk.example/router';
const requests: Request[] = [];
const values = new Map<string, string>();
const fetcher = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, {status});

beforeEach(() => {
  requests.length = 0;
  values.clear();
  fetcher.mockReset();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

function backend(status = 200, mode = 'password', setup = false) {
  fetcher.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.endsWith('/api')) return json({api_major: 1, auth: {mode, setup_required: setup}});
    if (request.url.endsWith('/api/v1/capabilities')) return json(status === 200 ? capabilities : {error: {code: 'authentication_required'}}, status);
    throw new Error(`Unexpected request: ${request.url}`);
  });
}

it('connects anonymously to the hosted root and saves only the lite connection', async () => {
  backend();
  const result = await connectionStartup(null, false, loc);
  expect(result).toMatchObject({connection: {address}});
  expect(requests.map(request => request.url)).toEqual([`${address}/api`, `${address}/api/v1/capabilities`]);
  expect(requests.every(request => !request.headers.has('Authorization'))).toBe(true);
  expect([...values]).toEqual([['doona-lite.connection', JSON.stringify({address, token: ''})]]);
});

it.each([401, 403])('resolves each sign-in step after capabilities returns %s', async status => {
  for (const [mode, setup, kind] of [
    ['password', false, 'login'],
    ['password', true, 'setup'],
    ['token', false, 'token']
  ] as const) {
    backend(status, mode, setup);
    await expect(connectionStartup(null, false, loc)).resolves.toEqual({address, kind});
    expect(values.size).toBe(0);
  }
});

it('retains the URL form after a network failure', async () => {
  fetcher.mockRejectedValue(new TypeError('offline'));
  await expect(connectionStartup(null, false, loc)).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each([
  () => new Response('<html>static host</html>', {headers: {'Content-Type': 'text/html'}}),
  () => json({api_major: 2}),
  () => json({}, 404),
  () => json({}, 403)
])('retains the URL form when discovery does not identify honk', async response => {
  fetcher.mockImplementation(async () => response());
  await expect(connectionStartup(null, false, loc)).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});

it('recognizes the same legacy bearer challenge as the standard app', async () => {
  fetcher.mockImplementation(async input => {
    const request = new Request(input);
    if (request.url.endsWith('/api')) return new Response(null, {status: 401, headers: {'WWW-Authenticate': 'Bearer'}});
    return json({error: {code: 'authentication_required'}}, 401);
  });
  await expect(connectionStartup(null, false, loc)).resolves.toEqual({address, kind: 'token'});
});

it('restores a saved backend with its credential without probing the page origin', async () => {
  backend();
  const saved = {address: 'https://saved.example', token: 'saved-session'};
  await expect(connectionStartup(saved, false, loc)).resolves.toMatchObject({connection: {address: saved.address}});
  expect(requests.map(request => request.url)).toEqual([`${saved.address}/api/v1/capabilities`]);
  expect(requests[0].headers.get('Authorization')).toBe('Bearer saved-session');
});

it('ignores saved demo connections without contacting a backend', async () => {
  await expect(connectionStartup({address: 'mock', token: ''}, false, loc)).resolves.toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([401, 403])('leaves a saved connection refusal (%s) to the existing restore handler', async status => {
  backend(status);
  await expect(connectionStartup({address: 'https://saved.example', token: 'expired'}, false, loc)).rejects.toMatchObject({status});
  expect(requests.map(request => request.url)).toEqual(['https://saved.example/api/v1/capabilities']);
});

it('reports capabilities failures after honk discovery without inventing a sign-in step', async () => {
  backend(500);
  await expect(connectionStartup(null, false, loc)).rejects.toBeInstanceOf(ApiError);
  expect(requests.map(request => request.url)).toEqual([`${address}/api`, `${address}/api/v1/capabilities`]);
});

it.each([null, {address: 'https://saved.example', token: 'saved-session'}])('does not probe or restore in a demo build', async saved => {
  await expect(connectionStartup(saved, true, loc)).resolves.toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
