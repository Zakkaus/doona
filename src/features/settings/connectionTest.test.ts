import {hookHarness} from '../../store/testHelpers';
import {afterEach, expect, it, vi} from 'vitest';
import {probeBackend, useConnectionTest} from './connectionTest';

vi.mock('react', async original => ({...(await original<typeof import('react')>()), ...hookHarness.hooks}));

const base = 'https://router.test';
const origin = 'https://ui.test';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
// Answers only once the request is aborted, the way a stalled backend does.
const stalled = () =>
  vi.fn(
    (request: Request) =>
      new Promise<Response>((_, reject) => {
        const fail = () => reject(request.signal.reason);
        if (request.signal.aborted) fail();
        else request.signal.addEventListener('abort', fail);
      })
  );

afterEach(() => vi.unstubAllGlobals());

it('reads the API version and sign-in mode a backend reports', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({name: 'daeuniverse/native', api_major: 1, auth: {mode: 'password', setup_required: false}}))
  );
  expect(await probeBackend(base, '', new AbortController().signal, origin)).toEqual({version: '1', password: true});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({name: 'daeuniverse/native', api_major: 2, auth: {mode: 'token', setup_required: false}}))
  );
  expect(await probeBackend(base, 'secret', new AbortController().signal, origin)).toEqual({version: '2', password: false});
});

it('names a discovery without an API version and a refused token, keeping the request id', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({name: 'something else'}))
  );
  expect(await probeBackend(base, '', new AbortController().signal, origin)).toEqual({failure: {key: 'settings.invalidResponse'}, requestId: null});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({error: {code: 'authentication_required', message: 'Token required'}, request_id: 'req-7'}, 401))
  );
  expect(await probeBackend(base, 'wrong', new AbortController().signal, origin)).toEqual({
    failure: {key: 'settings.tokenRejected'},
    requestId: 'req-7'
  });
});

it('reports a timed-out test and nothing for a cancelled one', async () => {
  vi.stubGlobal('fetch', stalled());
  const timed = new AbortController();
  const timing = probeBackend(base, '', timed.signal, origin);
  timed.abort(new DOMException('Connection timeout', 'TimeoutError'));
  expect(await timing).toEqual({failure: {key: 'settings.timeout'}, requestId: null});

  const cancelled = new AbortController();
  const cancelling = probeBackend(base, '', cancelled.signal, origin);
  cancelled.abort();
  expect(await cancelling).toBeNull();
});

it('offers the test again after a hidden page cancels the one in flight', async () => {
  hookHarness.reset();
  vi.stubGlobal('location', {origin});
  vi.stubGlobal('fetch', stalled());
  const read = () => hookHarness.render(useConnectionTest);
  read();
  hookHarness.runEffects();
  const running = read().run(base, '', vi.fn());
  expect(read().pending).toBe(true);
  // A hidden <Activity> runs the effect cleanups and keeps the state.
  hookHarness.unmount();
  await running;
  read();
  hookHarness.runEffects();
  expect(read().pending).toBe(false);
});
