// Screenshot a section of the page at desktop scale: node shot.mjs URL WIDTH SELECTOR OUT.png
import {spawn} from 'node:child_process';
// Fresh Chrome per run: unique port and profile, so no stale page or cache survives between runs.
const PORT = String(9400 + (process.pid % 500));
const UDD = '/scratch/ssd/doona-tools/chrome-' + process.pid;
import {rmSync} from 'node:fs';
process.on('exit', () => { try { rmSync(UDD, {recursive: true, force: true}); } catch {} });
import {writeFileSync} from 'node:fs';
const [url, w, sel, out] = process.argv.slice(2); const width = +w;
const chrome = spawn('google-chrome-stable', ['--headless=new','--disable-gpu','--remote-debugging-port=' + PORT, '--user-data-dir=' + UDD,'--window-size='+width+',6000','--hide-scrollbars','about:blank'], {stdio: 'ignore'});
await new Promise(r => setTimeout(r, 1500));
const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id: i, method, params})); });
await send('Emulation.setDeviceMetricsOverride', {width, height: 6000, deviceScaleFactor: 1, mobile: false});
const touch = !!process.env.TOUCH;
await send('Emulation.setEmulatedMedia', {features: touch ? [{name: 'hover', value: 'none'}, {name: 'pointer', value: 'coarse'}] : [{name: 'hover', value: 'hover'}, {name: 'pointer', value: 'fine'}]});
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', {cacheDisabled: true});
await send('Page.navigate', {url});
if (process.env.PRE) { await new Promise(r => setTimeout(r, 2500)); await send('Runtime.evaluate', {expression: process.env.PRE}); await send('Page.navigate', {url: 'about:blank'}); await new Promise(r => setTimeout(r, 300)); await send('Page.navigate', {url}); }
for (let i = 0; i < 20; i++) { const r = await send('Runtime.evaluate', {expression: `!!document.querySelector(${JSON.stringify(sel)})`}); if (r.result?.result?.value) break; await new Promise(r => setTimeout(r, 500)); }
if (!touch) await send('Runtime.evaluate', {expression: `document.documentElement.style.setProperty('--s2-scale','1'); document.documentElement.style.setProperty('--s2-font-size-base','14'); 'ok'`});
await new Promise(r => setTimeout(r, 1500));
const box = await send('Runtime.evaluate', {expression: `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify({x: r.x, y: r.y, w: r.width, h: r.height}); })()`});
if (!box.result?.result?.value) { console.error(JSON.stringify(box)); process.exit(1); } const b = JSON.parse(box.result.result.value);
const shot = await send('Page.captureScreenshot', {format: 'png', clip: {x: b.x, y: b.y, width: b.w, height: Math.min(b.h, 1400), scale: 1}, captureBeyondViewport: true});
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
ws.close(); chrome.kill(); console.log(out, JSON.stringify(b));
