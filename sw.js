const PREFIX = `doona-shell:${self.registration.scope}:`;
// The page reads the same build from index.html, to tell whether this worker taking it over is a new build.
const BUILD = '8c9f4a366a75c5ec';
const CACHE = PREFIX + BUILD;
const PRECACHE = ["assets/AddCircle-BRmj4rHn.js","assets/AppearanceControls-D_5zByX0.js","assets/AreaChart-B5d70s5M.js","assets/AreaCurve-DQSHOSpG.js","assets/BackendText-mPTFpoWY.js","assets/CardView-D8H6K2o9.js","assets/Checkbox-CT1q_W2A.js","assets/CheckboxSet-BxYQ45Re.js","assets/CodeEditor-BNLfF_rV.js","assets/Config-DNBXreox.js","assets/Connections-BHJlHC4Z.js","assets/Copy-DRraE5am.js","assets/Coverage-BDuVUwmc.js","assets/DaeCode-DEjXqvav.js","assets/Delete-C_XYFAI5.js","assets/Dns-CJ1gq8Zq.js","assets/Dns-CsAXSf3H.css","assets/Donut-BFj2HtpE.js","assets/Editors-C7JsHxl4.js","assets/Editors-rPgk_VZK.css","assets/Events-aGXEzGcy.js","assets/FlagPicker-vMDjrRoM.js","assets/Flows-BekA1vQh.css","assets/Flows-aGLwdcE_.js","assets/GridList-Bh7fMIAB.js","assets/ItemText-LrgNDltA.js","assets/LinkOut-D-v-J5rM.js","assets/Login-D_c7P0t9.js","assets/Logs-Eiw0Um23.js","assets/ManualFields-BYdyPUG_.js","assets/ModeReadOnlyHint-Ct-YNQNH.js","assets/NodePath-88BzDF11.js","assets/Nodes-CM_U6MZ3.css","assets/Nodes-DAwrvtZ2.js","assets/NumberField-C33GiIbA.js","assets/Overview-Ba1IaYZR.js","assets/Policies-DOXNJcE4.js","assets/Rules-DGh1xpNs.js","assets/SearchDialog-COzDztVx.js","assets/SearchList-DGQPE4Td.js","assets/SearchSelect-Dp_W9cMr.js","assets/Select-utCejygd.js","assets/Settings-BVpmQMTB.css","assets/Settings-Cqr1GQmm.js","assets/Sparkline-Czc5bK1e.js","assets/SubscriptionFields-A5sjNFUO.js","assets/Table-B3vnlxi2.js","assets/Tabs-YG4CM8JP.js","assets/Tag-DTb5sx4t.js","assets/TimeCell-Dz4850NG.js","assets/Trace-CwMaC8hX.js","assets/TwemojiCountryFlags-Bymva2JV.woff2","assets/Virtualizer-3nWjKu2i.js","assets/WallpaperSettings-CN118Xwe.js","assets/XhttpOptions-D6yoyLC6.js","assets/_commonjsHelpers-CXUWDbkB.js","assets/activity-CgcM8uHz.css","assets/activity-CvMVzTgg.js","assets/antd-BTVob2XE.css","assets/arco-DnDQV30N.css","assets/array-C0VuvQyb.js","assets/auth-CXmg4-QT.js","assets/auth-CgLOqPdR.js","assets/catppuccin-CFfx8ddQ.css","assets/daeTokens-BVtuNnWZ.js","assets/duck-night-CbKHyiul.webp","assets/files-Dt8K7QfP.js","assets/flows-BnIRC4WQ.js","assets/fonts-C5_wsAqZ.css","assets/geodata-CvcFemyc.js","assets/geodataUpdate-8JtxOjyl.js","assets/glass-BcMm4w7K.js","assets/glass-piYllnzE.css","assets/gorges-dark-FlgXSNn1.webp","assets/gorges-light-DCWkLX37.webp","assets/groupFilters-DZoyV8zU.js","assets/halloween-Dfny7j3b.js","assets/halloween-e3DfiasY.css","assets/impact-B8feJDtJ.css","assets/index-CHXFD1kV.js","assets/index-DUM-iwa2.js","assets/index-DdIDwpAM.css","assets/ipLookup-BYorpVJi.css","assets/ipLookup-BqxNmw4p.js","assets/kary-pGa0AxYi.css","assets/labels-D8xxfRTQ.js","assets/lake-dark-B_VaUlAe.webp","assets/lake-light-oWll36-V.webp","assets/lens-BMneTJKP.js","assets/limitHint-BqVy_BTZ.js","assets/logo-CKC46m8V.svg","assets/logo-obi05X1B.svg","assets/logs-C4SR-CEO.js","assets/match.worker-B2aIccpg.js","assets/nav-B0BoJ7OB.js","assets/nav-BsBtsCfu.js","assets/nodes-DdLuQtJ3.js","assets/nord-BE7QITf9.css","assets/outbounds-BBPt8rkq.js","assets/paletteSheet-Vc0PGoNW.js","assets/paletteSheets-Bf5fGVE_.js","assets/probe-CVHVG2eD.js","assets/qiangguo-CTOUSOCk.css","assets/recorder-BHyqDNp5.js","assets/rule-DjPo0dVY.js","assets/semi-DGpddBEP.css","assets/square-dark-CG0rwsS1.webp","assets/square-light-OU6dsCf9.webp","assets/subscriptionEntries-CxAyd-z-.js","assets/taishan-dark-BI3cd4fj.webp","assets/taishan-light-Dip0HmJZ.webp","assets/useGridSelectionCheckbox-VlQgbut4.js","assets/useQuickRule-Uvl4VvTW.js","assets/vendor-editor-50h2cCk6.js","assets/vendor-react-64fcanlc.js","assets/wall-dark-DCO0xUUO.webp","assets/wall-light-BYfte2Bi.webp","assets/wallpaper-CEC7gitM.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses. A partial
// language's list holds the reference language's files too, since it loads them.
const LANGUAGES = {"zh-TW":["assets/fonts-tc-D9rvq3k7.css","assets/locale-zh-TW-activity-B-iiostr.js","assets/locale-zh-TW-core-CXhgGZht.js","assets/locale-zh-TW-rest-C043kV6r.js"],"zh-CN":["assets/fonts-sc-Dyn9aW84.css","assets/locale-zh-CN-activity-BOcZ16N3.js","assets/locale-zh-CN-core-Bee1WHW4.js","assets/locale-zh-CN-rest-CA3U-MW-.js"],"en":["assets/locale-en-activity-DN26SxgG.js","assets/locale-en-core-DaThY8z_.js","assets/locale-en-rest-1oBOhp74.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-DxqqlzZT.js"];
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
  if (url.pathname.startsWith(new URL('lite/', ROOT).pathname)) return;
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
