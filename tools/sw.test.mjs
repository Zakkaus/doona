import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect, it, vi} from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function worker(scope, offline = false) {
  const handlers = {};
  const cache = {match: vi.fn(async () => new Response('doona index')), put: vi.fn()};
  const caches = {open: vi.fn(async () => cache), match: vi.fn()};
  const fetch = vi.fn(async () => {
    if (offline) throw new TypeError('Offline');
    return new Response('network');
  });
  runInNewContext(source, {
    self: {registration: {scope}, addEventListener: (type, handler) => (handlers[type] = handler)},
    URL,
    Response,
    Headers,
    caches,
    fetch
  });
  const request = (path, mode = 'navigate') => {
    const respondWith = vi.fn();
    handlers.fetch({request: {url: new URL(path, scope).href, method: 'GET', mode}, respondWith});
    return respondWith;
  };
  return {request, caches, fetch};
}

it.each(['https://demo.example/', 'https://demo.example/ui/'])('leaves every Lite request to the network under %s', scope => {
  for (const offline of [false, true]) {
    const sw = worker(scope, offline);
    for (const path of ['lite/', 'lite/?page=nodes', 'lite/index.html', 'lite/nested/page', 'lite/assets/app.js', 'lite/fonts/font.woff2']) {
      for (const mode of ['navigate', 'cors', 'no-cors']) expect(sw.request(path, mode)).not.toHaveBeenCalled();
    }
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(sw.fetch).not.toHaveBeenCalled();
  }
});

it.each(['https://demo.example/', 'https://demo.example/ui/'])('keeps the doona offline fallback under %s', async scope => {
  const sw = worker(scope, true);
  for (const path of ['', 'index.html', 'lite-other/']) {
    const respond = sw.request(path);
    expect(respond).toHaveBeenCalledOnce();
    const response = await respond.mock.calls[0][0];
    expect(await response.text()).toBe('doona index');
    expect(response.headers.get('x-doona-sw')).toBe('hit');
  }
  expect(sw.request('assets/app.js', 'cors')).toHaveBeenCalledOnce();
});
