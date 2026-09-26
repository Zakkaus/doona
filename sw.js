const PREFIX = `doona-shell:${self.registration.scope}:`;
const CACHE = PREFIX + 'c0efa1fb3c57adb4';
const PRECACHE = ["assets/ActionGroup-BmTcvtst.js","assets/AreaChart-wkbsPjWf.js","assets/AreaCurve-BriPYJva.js","assets/Arrange-Dd3j3leY.css","assets/Arrange-aVWX7IOJ.js","assets/Beeswarm-DNOca5Zb.js","assets/Config-DIoMN7sV.js","assets/Connections-CfUP8-X9.js","assets/DaeCode-B4MDdwFy.js","assets/Dns-DgDr4ceF.js","assets/Donut-BnIKEv67.js","assets/Events-BejIAkkd.js","assets/FactStrip-3SG__anK.js","assets/ListLayout-CQF-S93A.js","assets/Login-5UjNYupq.js","assets/Logs-BTbQEkWw.js","assets/NodeSearch-CpI2imbr.js","assets/Nodes--ulAbvgO.js","assets/Overview-C6jbeXLD.js","assets/Policies-6avUTszk.js","assets/PolicyPicker-DGoJLfRw.js","assets/Rules-DDSfR4w0.js","assets/Rules-l5FnUA9B.css","assets/SearchDialog-CqJNbpH4.js","assets/Settings-Da2KatzG.js","assets/Sparkline-DJirFfz2.js","assets/Table-BssVn3ea.js","assets/TimeCell-BnNQoivb.js","assets/Virtualizer-BCoKmwck.js","assets/array-C0P64tl-.js","assets/auth-B7r9l9Ed.js","assets/dns-BTz3mzdV.js","assets/duck-night-CbKHyiul.webp","assets/files-BxEOxSF8.js","assets/flows-CnQmj75b.js","assets/geodata-DprMPspn.js","assets/index-5gJaENQ3.js","assets/index-C0YvLycg.css","assets/layout-C_QApVk7.js","assets/link-BTCYXO_S.js","assets/logo-obi05X1B.svg","assets/logs-CKV_6JYB.js","assets/nav-B7JMQHI7.js","assets/nav-BIpfWn6-.js","assets/nav-BeFLfZq8.js","assets/nav-DvubWQCN.js","assets/outbounds-BGpgS_Ub.js","assets/policyText-YaC3njy9.js","assets/probe-Gi3P91zf.js","assets/setup-CztWFYja.js","assets/useFilter-ZqhE2IXQ.js","assets/useGridSelectionCheckbox-CLAdOssx.js","assets/vendor-editor-BYSNX95r.js","assets/vendor-react-Bf71BWbF.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses.
const LANGUAGES = {"zh-CN":["assets/fonts-sc-DWPGxLPK.css","assets/locale-zh-CN-B9zl3qNG.js"],"zh-TW":["assets/fonts-tc-B6Zt5HQN.css","assets/locale-zh-TW-Bz4uOCsq.js"],"en":["assets/locale-en-CUosNqmh.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-CEHdUZfJ.js"];
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
