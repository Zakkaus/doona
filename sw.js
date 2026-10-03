const PREFIX = `doona-shell:${self.registration.scope}:`;
// The page reads the same build from index.html, to tell whether this worker taking it over is a new build.
const BUILD = '97aad4fbe4b4fff8';
const CACHE = PREFIX + BUILD;
const PRECACHE = ["assets/ActionGroup-D25I-kZr.js","assets/AddCircle-Rj4pr_Kq.js","assets/AreaChart-Q0lPtN9l.js","assets/AreaCurve-DQSHOSpG.js","assets/ConditionRow-DLX3ofhF.js","assets/Config-DNuVMq2n.js","assets/Connections-D8S-Q7Wa.js","assets/Coverage-YaaUbQsY.js","assets/DaeCode-DEjXqvav.js","assets/Delete-DL4KTZ3z.js","assets/Dns-B_Dnq323.js","assets/Donut-CdaeTLgo.js","assets/Editors-CeFgfjsS.js","assets/Editors-rPgk_VZK.css","assets/Events-BG-Qakoo.js","assets/FlagPicker-Cb4Xwgqg.js","assets/Flows-B78_vhjx.css","assets/Flows-DLcRaXXv.js","assets/GridList-BQT8v1Oa.js","assets/Login-Bjog8fjv.js","assets/LoginShowcase-BoAsSsTi.js","assets/Logs-DOgJ82Tl.js","assets/Nodes-pHa6M6M_.js","assets/OutboundTag-DlxohBNr.js","assets/Overview-COsYKjeP.js","assets/Policies-DeRxiXFv.js","assets/ProbeOptionsDialog-D5UlgFL_.js","assets/Rules-Cr7tTQNN.js","assets/SearchDialog-DCFmjPez.js","assets/SearchList-BvRubS4g.js","assets/SearchSelect-C-BAytx5.js","assets/Select-CW4hy7p4.js","assets/Settings-xMadpcCs.js","assets/Sparkline-CoZQ8288.js","assets/Table-AUMIxmY3.js","assets/Tabs-BuWF_N6K.js","assets/Tag-CtWKvQGx.js","assets/TimeCell-D6XXwZqj.js","assets/Toolbar-Brn-PcCA.js","assets/TwemojiCountryFlags-Bymva2JV.woff2","assets/Virtualizer-ChqMeXB2.js","assets/_commonjsHelpers-CXUWDbkB.js","assets/activity-D1LnEA1G.css","assets/activity-DAVbWajN.js","assets/array-C0VuvQyb.js","assets/auth-0womtMcI.js","assets/auth-DxdJ9do-.js","assets/daeTokens-BVtuNnWZ.js","assets/duck-night-CbKHyiul.webp","assets/files-Dt8K7QfP.js","assets/flows-BROwuxz5.js","assets/fonts-C5_wsAqZ.css","assets/format-D6vpSc2y.js","assets/geodata-X0pHz03D.js","assets/gorges-dark-FlgXSNn1.webp","assets/gorges-light-DCWkLX37.webp","assets/impact-B8feJDtJ.css","assets/index-BCV6oeUn.js","assets/index-Bj-Z8Ubw.css","assets/index-DUM-iwa2.js","assets/labels-DPpd4zRF.js","assets/lake-dark-B_VaUlAe.webp","assets/lake-light-oWll36-V.webp","assets/logo-obi05X1B.svg","assets/match.worker-B2aIccpg.js","assets/nav-BIXgi_Oj.js","assets/nav-BN-UXMT_.js","assets/nav-DbaZzY0f.js","assets/nav-GngA1GkJ.js","assets/nav-JH-QoA7N.js","assets/nav-Wiib71Wo.js","assets/nav-rP_bWFwE.js","assets/outbounds-DWcttu4X.js","assets/probe-CqnnfVPK.js","assets/recorder-BHyqDNp5.js","assets/square-dark-CG0rwsS1.webp","assets/square-light-OU6dsCf9.webp","assets/taishan-dark-BI3cd4fj.webp","assets/taishan-light-Dip0HmJZ.webp","assets/useGridSelectionCheckbox-DoRdODkq.js","assets/useQuickRule-D_8svVrr.js","assets/vendor-editor-BRV-W12m.js","assets/vendor-react-64fcanlc.js","assets/wall-dark-DCO0xUUO.webp","assets/wall-light-BYfte2Bi.webp","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses. A partial
// language's list holds the reference language's files too, since it loads them.
const LANGUAGES = {"zh-TW":["assets/fonts-tc-D9rvq3k7.css","assets/locale-zh-TW-C9pZrVbY.js"],"zh-CN":["assets/fonts-sc-Dyn9aW84.css","assets/locale-zh-CN-Du0V2HQE.js"],"en":["assets/locale-en-Cwza0PWE.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-Bzr08etw.js"];
const ROOT = new URL(self.registration.scope);

// A new build takes over on the next online load, including open dashboard tabs.
// Each build records when it was installed, so activation can tell the build it replaces from older ones.
const STAMP = new URL('__installed__', ROOT);
// index.html keeps its name across builds, so it is fetched past the HTTP cache: a caching proxy cannot hand the new
// build an old shell. A file under assets/ is named after its content hash, so the copy the page already loaded through
// the HTTP cache is the same file and is not downloaded again.
const precacheRequest = url => (url.startsWith('assets/') ? url : new Request(url, {cache: 'reload'}));
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => Promise.all([cache.addAll(PRECACHE.map(precacheRequest)), cache.put(STAMP, new Response(String(Date.now())))]))
      .then(() => self.skipWaiting())
  );
});
// A page loads its catalogue and backend before this worker controls it, so it reports the language it shows and
// whether it runs on the mock, to have them cached.
self.addEventListener('message', event => {
  if (event.data?.build === true) {
    event.ports[0]?.postMessage(BUILD);
    return;
  }
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
      // A host may answer a missing file with the page; caching that would keep the file missing once it is installed.
      if (fresh.ok && fresh.type === 'basic' && !fresh.redirected && !fresh.headers.get('content-type')?.includes('html'))
        await cache.put(request, fresh.clone());
      return fresh;
    })()
  );
});
