// Ink gaps inside a 4x crop from crop.mjs: prints top/bottom gap and their half-difference (+ = ink sits low).
import {readFileSync} from 'node:fs'; import {PNG} from './png.mjs';
for (const f of process.argv.slice(2)) { const p = PNG.decode(readFileSync(f)); const s = 4, inset = 4*s;
  const l = inset, r = p.width - inset, t = inset, b = p.height - inset; const px = (x,y) => { const i=(y*p.width+x)*4; return [p.data[i],p.data[i+1],p.data[i+2]]; };
  const bg = px(Math.round((l+r)/2), t + 3*s); const diff = (a) => Math.abs(a[0]-bg[0])+Math.abs(a[1]-bg[1])+Math.abs(a[2]-bg[2]);
  const x0 = l + Math.round((r-l)*0.3), x1 = l + Math.round((r-l)*0.7); const rows = [];
  for (let y = t + 2*s; y < b - 2*s; y++) { let m = 0; for (let x = x0; x < x1; x++) m = Math.max(m, diff(px(x,y))); if (m > 120) rows.push(y); }
  const top = (rows[0]-t)/s, bot = (b-rows[rows.length-1]-1)/s; console.log(f.split('/').pop().padEnd(16), 'h='+((b-t)/s), 'inkTop='+top.toFixed(2), 'inkBot='+bot.toFixed(2), 'off='+((top-bot)/2).toFixed(2)); }
