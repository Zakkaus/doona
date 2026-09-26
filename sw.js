const PREFIX = `doona-shell:${self.registration.scope}:`;
const CACHE = PREFIX + 'b948473310477cf5';
const PRECACHE = ["assets/ActionGroup-BSppVD59.js","assets/AreaChart-h3Gkjzaa.js","assets/AreaCurve-BriPYJva.js","assets/Arrange-Dd3j3leY.css","assets/Arrange-e3j27Clz.js","assets/Beeswarm-jAzmtlqz.js","assets/Config--PVpisml.js","assets/Connections-CCFGZikL.js","assets/DaeCode-B4MDdwFy.js","assets/Dns-DdSjsAPF.js","assets/Donut-DkYme--s.js","assets/Events-D4hZU38z.js","assets/FactStrip-BDeuNQ2Z.js","assets/ListLayout-Bxgf2LdD.js","assets/Login-CrM_BNY0.js","assets/Logs-vfd9hzKQ.js","assets/NodeSearch-BuDVdT7y.js","assets/Nodes-Cig593de.js","assets/Overview-DyYutpMm.js","assets/Policies-DGpNeCLm.js","assets/PolicyPicker-vh6_WZ5d.js","assets/Rules-Bp-6u8jR.js","assets/Rules-l5FnUA9B.css","assets/SearchDialog-BbLV79qX.js","assets/Settings-IxmP35mM.js","assets/Sparkline-s03N3ck4.js","assets/Table-CnBGT5pX.js","assets/TimeCell-rqF8sOYn.js","assets/Virtualizer-BZUdrlNI.js","assets/array-C0P64tl-.js","assets/auth-A96L4fhE.js","assets/dns-CCbKO2FA.js","assets/duck-night-CbKHyiul.webp","assets/files-BxEOxSF8.js","assets/flows-DWpxX5Se.js","assets/geodata-DprMPspn.js","assets/index-CWHVcsTq.js","assets/index-D-2_AnA-.css","assets/layout-B6IPFNrB.js","assets/link-dvxAGCAk.js","assets/logo-obi05X1B.svg","assets/logs-DuGOLQCA.js","assets/nav-BIpfWn6-.js","assets/nav-BeFLfZq8.js","assets/nav-CikdXmOV.js","assets/nav-gNPTmyWX.js","assets/outbounds-BY7KeA4N.js","assets/policyText-CC0TCY38.js","assets/probe-DjQ1buA2.js","assets/setup-DdbEc3Lh.js","assets/useFilter-B8DjFiiV.js","assets/useGridSelectionCheckbox-CsPiaRwL.js","assets/vendor-editor-BYSNX95r.js","assets/vendor-react-Bf71BWbF.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses.
const LANGUAGES = {"zh-CN":["assets/fonts-sc-DWPGxLPK.css","assets/locale-zh-CN-3Y4LNSUY.js"],"zh-TW":["assets/fonts-tc-B6Zt5HQN.css","assets/locale-zh-TW-B6DBSCH8.js"],"en":["assets/locale-en-RONfmQjt.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-ftfcOmFH.js"];
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
