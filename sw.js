const PREFIX = `doona-shell:${self.registration.scope}:`;
const CACHE = PREFIX + '13005d2efccfeed8';
const PRECACHE = ["assets/ActionGroup-Dri3jFQ7.js","assets/AreaChart-BT6_0bqU.js","assets/AreaCurve-BriPYJva.js","assets/Arrange-Be8N0jow.js","assets/Arrange-Dd3j3leY.css","assets/Beeswarm-pOo9oRJc.js","assets/Config-C67giUNe.js","assets/Connections-NBOK1MHZ.js","assets/DaeCode-B4MDdwFy.js","assets/Dns-D_pYYLRk.js","assets/Donut-BqN6lDr3.js","assets/Events-Br5_e43U.js","assets/FactStrip-CFlKJzdp.js","assets/ListLayout-CZuL0Te-.js","assets/Login-CYP09feh.js","assets/Logs-DNHnUtDB.js","assets/NodeSearch-DqSfhZIq.js","assets/Nodes-BOlxNa53.js","assets/Overview-DiZ1EbvZ.js","assets/Policies-D3BkfEvQ.js","assets/PolicyPicker-TtQLXNBo.js","assets/Rules-COj4LgMa.js","assets/Rules-l5FnUA9B.css","assets/SearchDialog-DC2keds5.js","assets/Settings-DGQbgb8_.js","assets/Sparkline-j5TAy7YR.js","assets/Table-BAn9FhsU.js","assets/TimeCell-EpOiNMhm.js","assets/Virtualizer-Cbkxgk1W.js","assets/array-C0P64tl-.js","assets/auth-CAgUT76u.js","assets/dns-Cj3dkFCu.js","assets/duck-night-CbKHyiul.webp","assets/files-BxEOxSF8.js","assets/flows-6sW_jRdW.js","assets/geodata-DprMPspn.js","assets/index-BHZh25gI.js","assets/index-DG8o6HvU.css","assets/layout-P29goIri.js","assets/link-mfzwFqbh.js","assets/logo-obi05X1B.svg","assets/logs-Y2EK6J_h.js","assets/nav-BIpfWn6-.js","assets/nav-Baot4PTh.js","assets/nav-BeFLfZq8.js","assets/nav-jf8PFMVy.js","assets/outbounds-18lJ9JsF.js","assets/policyText-D7ZVyS3Q.js","assets/probe-De00cL2S.js","assets/setup-DOQaVW5D.js","assets/useFilter-D5bP4xxv.js","assets/useGridSelectionCheckbox-DlqM-f1T.js","assets/vendor-editor-BYSNX95r.js","assets/vendor-react-Bf71BWbF.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses.
const LANGUAGES = {"zh-CN":["assets/fonts-sc-DWPGxLPK.css","assets/locale-zh-CN-RWyFDaMe.js"],"zh-TW":["assets/fonts-tc-B6Zt5HQN.css","assets/locale-zh-TW-DISfv5UD.js"],"en":["assets/locale-en-pTPfSe59.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-C8ppQqtG.js"];
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
