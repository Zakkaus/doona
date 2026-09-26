const PREFIX = `doona-shell:${self.registration.scope}:`;
const CACHE = PREFIX + '33acc45715f85bc9';
const PRECACHE = ["assets/ActionGroup-B_b18fmi.js","assets/AreaChart-BkbP8PKR.js","assets/AreaCurve-BriPYJva.js","assets/Arrange-Dd3j3leY.css","assets/Arrange-KFnHjYUB.js","assets/Beeswarm-4vL2V9Ps.js","assets/Config-Cd--z_9R.js","assets/Connections-D-cT5WqT.js","assets/DaeCode-B4MDdwFy.js","assets/Dns-C1VhxKYx.js","assets/Donut-DtJvaYng.js","assets/Events-DnhHfv42.js","assets/FactStrip-BhE59Cbu.js","assets/ListLayout-BocjHRcT.js","assets/Login--tvyGTi1.js","assets/Logs-CCp8iKhT.js","assets/NodeSearch-GnPAfwgr.js","assets/Nodes-DsATN4-S.js","assets/Overview-CxQfXvLl.js","assets/Policies-BmmjdERg.js","assets/PolicyPicker-BvRTBdDB.js","assets/Rules-B715uwqU.js","assets/Rules-l5FnUA9B.css","assets/SearchDialog-DNa4XROJ.js","assets/Settings-pVrziZ8Y.js","assets/Sparkline-rpDYYqKH.js","assets/Table-BuFM8WuH.js","assets/TimeCell-Dls_OPt6.js","assets/Virtualizer-CBYNHMf_.js","assets/array-C0P64tl-.js","assets/auth-D7XYidJH.js","assets/dns-CStcbl5Q.js","assets/duck-night-CbKHyiul.webp","assets/files-BxEOxSF8.js","assets/flows-D2XFC_8n.js","assets/geodata-DprMPspn.js","assets/index-CBEJVNOq.js","assets/index-CkVoFmWe.css","assets/layout-BpknWspW.js","assets/link-Bj7hfkRx.js","assets/logo-obi05X1B.svg","assets/logs-xV84XV8M.js","assets/nav-BIpfWn6-.js","assets/nav-BeFLfZq8.js","assets/nav-CjQpkXJ4.js","assets/nav-Di7uv1qQ.js","assets/outbounds-CcBfv65l.js","assets/policyText-DB_kWRyK.js","assets/probe-jPjYRHmo.js","assets/setup-CK8PJPcB.js","assets/useFilter-CFIvS1xI.js","assets/useGridSelectionCheckbox-S5AKP0ji.js","assets/vendor-editor-BYSNX95r.js","assets/vendor-react-Bf71BWbF.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses.
const LANGUAGES = {"zh-CN":["assets/fonts-sc-DWPGxLPK.css","assets/locale-zh-CN-C3orsvlj.js"],"zh-TW":["assets/fonts-tc-B6Zt5HQN.css","assets/locale-zh-TW-DymEh6Oc.js"],"en":["assets/locale-en-fUAhtF5A.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-D5o-LK24.js"];
const ROOT = new URL(self.registration.scope);

// A new build takes over on the next online load, including open dashboard tabs.
// Each build records when it was installed, so activation can tell the build it replaces from older ones.
const STAMP = new URL('__installed__', ROOT);
// Fetched past the HTTP cache, so a caching proxy cannot hand the new build an old shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => Promise.all([cache.addAll(PRECACHE.map(url => new Request(url, {cache: 'reload'}))), cache.put(STAMP, new Response(String(Date.now())))]))
      .then(() => self.skipWaiting())
  );
});
// A page loads its catalogue and backend before this worker controls it, so it reports the language it shows and
// whether it runs on the mock, to have them cached.
self.addEventListener('message', event => {
  const lang = event.data?.language;
  const files = [...(typeof lang === 'string' && Object.hasOwn(LANGUAGES, lang) ? LANGUAGES[lang] : []), ...(event.data?.mock === true ? MOCK : [])];
  if (!files.length) return;
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(files.map(async url => (await cache.match(url, {ignoreVary: true})) ?? cache.add(url)))));
});
// The build just replaced stays: tabs still showing it load their remaining chunks from it until reloaded.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const older = [];
      for (const key of await caches.keys()) {
        if (!key.startsWith(PREFIX) || key === CACHE) continue;
        const stamp = await (await caches.open(key)).match(STAMP);
        older.push({key, installed: stamp ? Number(await stamp.text()) : 0});
      }
      older.sort((a, b) => b.installed - a.installed);
      await Promise.all(older.slice(1).map(({key}) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

function hit(response) {
  if (!response) return Response.error();
  const headers = new Headers(response.headers);
  headers.set('x-doona-sw', 'hit');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || /\/api(?:\/|$)/.test(url.pathname) || !url.pathname.startsWith(ROOT.pathname)) return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !/^(assets|fonts|icons)\//.test(url.pathname.slice(ROOT.pathname.length))) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (navigation) {
        try {
          return await fetch(request);
        } catch {
          return hit(await cache.match(new URL('index.html', ROOT)));
        }
      }
      // A build file is the same for every requester, so a server's Vary: Origin must not turn a cached copy into a miss.
      const response = (await cache.match(request, {ignoreVary: true})) ?? (await caches.match(request, {ignoreVary: true}));
      if (response) return hit(response);
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic' && !fresh.redirected) await cache.put(request, fresh.clone());
      return fresh;
    })()
  );
});
