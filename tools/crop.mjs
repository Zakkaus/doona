// 4x crops of the control that contains a text occurrence: node crop.mjs URL OUTDIR 'text#n' ...   (BLOCK=1 blocks Typekit)
import {spawn} from 'node:child_process';
// Fresh Chrome per run: unique port and profile, so no stale page or cache survives between runs.
const PORT = String(9400 + (process.pid % 500));
const UDD = '/scratch/ssd/doona-tools/chrome-' + process.pid;
import {rmSync} from 'node:fs';
process.on('exit', () => {
  try {
    rmSync(UDD, {recursive: true, force: true});
  } catch {}
});
import {writeFileSync, readFileSync} from 'node:fs';
const [asc, desc] = (process.env.OVR || '100,20').split(',');
const faces =
  process.env.OVR === 'none'
    ? readFileSync(new URL('../src/fonts.css', import.meta.url), 'utf8').replace(/(ascent|descent|line-gap)-override: [^;]+; ?/g, '')
    : readFileSync(new URL('../src/fonts.css', import.meta.url), 'utf8')
        .replace(/ascent-override: \d+%/g, 'ascent-override: ' + asc + '%')
        .replace(/descent-override: \d+%/g, 'descent-override: ' + desc + '%');
const [url, dir, ...want] = process.argv.slice(2);
const chrome = spawn(
  'google-chrome-stable',
  [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + UDD,
    '--window-size=1440,6000',
    '--hide-scrollbars',
    'about:blank'
  ],
  {stdio: 'ignore'}
);
await new Promise(r => setTimeout(r, 1500));
const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise(r => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({id: i, method, params}));
  });
await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 6000, deviceScaleFactor: +(process.env.DPR || 1), mobile: false});
await send('Emulation.setEmulatedMedia', {
  features: [
    {name: 'hover', value: 'hover'},
    {name: 'pointer', value: 'fine'}
  ]
});
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', {cacheDisabled: true});
await send('Network.enable');
if (process.env.BLOCK) await send('Network.setBlockedURLs', {urls: ['*typekit.net*']});
await send('Page.navigate', {url});
await new Promise(r => setTimeout(r, 6000));
await send('Runtime.evaluate', {
  expression: `document.documentElement.style.setProperty('--s2-scale','1'); document.documentElement.style.setProperty('--s2-font-size-base','14'); const st = document.createElement('style'); st.textContent = ${JSON.stringify(faces)}; document.head.appendChild(st); 'ok'`
});
await new Promise(r => setTimeout(r, 2000));
const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => { const want = ${JSON.stringify(want)}; const out = {}; const seen = {};
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  for (const t of want) if (t.startsWith('raw:')) { const el = document.querySelector(t.slice(4)); if (el) { const b = el.getBoundingClientRect(); out[t] = {x: b.x - 4, y: b.y - 4, w: b.width + 8, h: b.height + 8}; } }
  for (const t of want) if (t.startsWith('css:')) { let el = document.querySelector(t.slice(4)); if (el) { for (let i = 0; i < 5; i++) { const cs = getComputedStyle(el); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px') break; el = el.parentElement; } const b = el.getBoundingClientRect(); out[t] = {x: b.x - 4, y: b.y - 4, w: b.width + 8, h: b.height + 8}; } }
  while ((n = w.nextNode())) { const t0 = n.textContent.trim(); seen[t0] = (seen[t0]||0)+1; const t = t0 + '#' + seen[t0]; if (!want.includes(t)) continue;
    let box = n.parentElement; for (let i = 0; i < 4; i++) { const cs = getComputedStyle(box); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px' || box.tagName === 'BUTTON') break; box = box.parentElement; }
    const b = box.getBoundingClientRect(); out[t] = {x: b.x - 4, y: b.y - 4, w: b.width + 8, h: b.height + 8}; }
  return out; })()`
});
for (const [name, b] of Object.entries(r.result.result.value)) {
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale: 4 / +(process.env.DPR || 1)},
    captureBeyondViewport: true
  });
  const f = dir + '/' + name.replace(/[#:\[\]=\s]/g, '-') + '.png';
  writeFileSync(f, Buffer.from(shot.result.data, 'base64'));
  console.log(f, JSON.stringify(b));
}
ws.close();
chrome.kill();
