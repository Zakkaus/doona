// Pixel-measure label centring inside S2 controls: launch Chrome with CDP, read boxes via Runtime, screenshot at 3x, scan ink.
import {spawn} from 'node:child_process';
// Fresh Chrome per run: unique port and profile, so no stale page or cache survives between runs.
const PORT = String(9400 + (process.pid % 500));
const UDD = '/scratch/ssd/doona-tools/chrome-' + process.pid;
import {rmSync} from 'node:fs';
process.on('exit', () => { try { rmSync(UDD, {recursive: true, force: true}); } catch {} });
import {writeFileSync} from 'node:fs';
import {PNG} from './png.mjs';
const url = process.argv[2]; const scale = 3; const [asc, desc] = (process.env.OVR || '98,22').split(',');
import {readFileSync} from 'node:fs';
const faces = readFileSync(new URL('../src/fonts.css', import.meta.url),'utf8').replace(/ascent-override: \d+%/g, 'ascent-override: '+asc+'%').replace(/descent-override: \d+%/g, 'descent-override: '+desc+'%');
const chrome = spawn('google-chrome-stable', ['--headless=new','--disable-gpu','--remote-debugging-port=' + PORT, '--user-data-dir=' + UDD,'--window-size=1440,6000','--hide-scrollbars','about:blank'], {stdio: 'ignore'});
await new Promise(r => setTimeout(r, 1500));
const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id: i, method, params})); });
await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 6000, deviceScaleFactor: scale, mobile: false});
await send('Emulation.setEmulatedMedia', {features: [{name: 'hover', value: 'hover'}, {name: 'pointer', value: 'fine'}]});
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); if (process.env.BLOCK) await send('Network.setBlockedURLs', {urls: ['*typekit.net*']});
await send('Page.navigate', {url});
await new Promise(r => setTimeout(r, 4000));
await send('Runtime.evaluate', {expression: `document.documentElement.style.setProperty('--s2-scale','1'); document.documentElement.style.setProperty('--s2-font-size-base','14'); const st=document.createElement('style'); st.textContent=${JSON.stringify(faces)}; document.head.appendChild(st); 'ok'`});
await new Promise(r => setTimeout(r, 3000));
const expr = `(() => { const want=${JSON.stringify(process.argv.slice(3))}; const out={};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
  const seen={}; while((n=walker.nextNode())){ const t0=n.textContent.trim(); seen[t0]=(seen[t0]||0)+1; const t=want.includes(t0+'@'+seen[t0])?t0+'@'+seen[t0]:t0; if(!want.includes(t)||out[t]) continue;
    let box=n.parentElement; for(let i=0;i<4;i++){ const cs=getComputedStyle(box); if(cs.backgroundColor!=="rgba(0, 0, 0, 0)"||cs.borderTopWidth!=="0px"||box.tagName==="BUTTON") break; box=box.parentElement; }
    const r=box.getBoundingClientRect(); if(r.height>48) continue; out[t]=[r.left,r.top,r.right,r.bottom]; }
  const inp=document.querySelector('input[placeholder]'); if(inp){const b=inp.parentElement.getBoundingClientRect(); out['search']=[b.left,b.top,b.right,b.bottom];}
  return JSON.stringify(out); })()`;
const boxes = JSON.parse((await send('Runtime.evaluate', {expression: expr, returnByValue: true})).result.result.value);
const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
const png = PNG.decode(Buffer.from(shot.result.data, 'base64'));
const px = (x, y) => { const i = (y * png.width + x) * 4; return [png.data[i], png.data[i+1], png.data[i+2]]; };
for (const [name, [l0, t0, r0, b0]] of Object.entries(boxes)) {
  const l = Math.round(l0*scale), t = Math.round(t0*scale), r = Math.round(r0*scale), b = Math.round(b0*scale);
  const bg = name === 'search' ? px(Math.round((l+r)/2), t+4) : px(l+4*scale, Math.round((t+b)/2));
  const ink = (x, y) => { const p = px(x, y); return Math.abs(p[0]-bg[0])+Math.abs(p[1]-bg[1])+Math.abs(p[2]-bg[2]) > 150; };
  const [xa, xb] = name === 'search' ? [l+40*scale, Math.min(r-40*scale, l+260*scale)] : [l+12*scale, r-12*scale];
  const rows = []; for (let y = t+3*scale; y < b-3*scale; y++) for (let x = xa; x < xb; x += 1) if (ink(x, y)) { rows.push(y); break; }
  if (!rows.length) { console.log(name.padEnd(12), 'no ink'); continue; }
  const top = (rows[0]-t)/scale, bot = (b-rows[rows.length-1])/scale;
  console.log(name.padEnd(12), `h=${((b-t)/scale).toFixed(1)} top=${top.toFixed(1)} bottom=${bot.toFixed(1)} off=${((top-bot)/2).toFixed(1)}`);
}
ws.close(); chrome.kill();
