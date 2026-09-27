import {afterEach, expect, it, vi} from 'vitest';
import {closeSession, openSession} from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// The backend accepts the request and never answers.
const hanging = () =>
  vi.fn(
    (_input: URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), {once: true}))
  );
// Headers arrive, then the body stalls part way.
const stalling = () =>
  vi.fn(
    async (_input: URL, init?: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"token":'));
            init?.signal?.addEventListener('abort', () => c.error(new DOMException('', 'AbortError')), {once: true});
          }
        }),
        {headers: {'Content-Type': 'application/json'}}
      )
  );
const credentials = {username: 'admin', password: 'correct horse'};

it.each([
  ['login', 'unanswered', hanging, 15, 'ui.errTimeout'],
  ['login', 'stalled', stalling, 15, 'ui.errTimeout'],
  ['setup', 'unanswered', hanging, 30, 'ui.errTimeoutWrite']
] as const)('gives up on a %s whose response is %s after its deadline', async (kind, _how, fetcher, seconds, key) => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetcher());
  const result = openSession('https://router.test', kind, credentials);
  const failure = expect(result).rejects.toMatchObject({status: 0, code: 'timeout', text: {key, params: {seconds}}});
  await vi.advanceTimersByTimeAsync(seconds * 1000);
  await failure;
});

it('gives up on a logout that gets no answer, with the write deadline', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', hanging());
  const result = closeSession('https://router.test', 'secret');
  const failure = expect(result).rejects.toMatchObject({status: 0, code: 'timeout', text: {key: 'ui.errTimeoutWrite', params: {seconds: 30}}});
  await vi.advanceTimersByTimeAsync(30000);
  await failure;
});
