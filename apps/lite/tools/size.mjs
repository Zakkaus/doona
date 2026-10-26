import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const dist = resolve(process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url)));
const manifest = JSON.parse(readFileSync(`${dist}/.vite/manifest.json`, 'utf8'));
const initial = new Set();
function visit(key) {
  const entry = manifest[key];
  if (initial.has(entry.file)) return;
  initial.add(entry.file);
  for (const child of entry.imports ?? []) visit(child);
}
for (const [key, entry] of Object.entries(manifest)) if (entry.isEntry) visit(key);
const linkedCss = [...readFileSync(`${dist}/index.html`, 'utf8').matchAll(/href="\.\/(assets\/[^"]+\.css)"/g)].map(match => match[1]);
const assets = [...new Set([...Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css ?? [])]), ...linkedCss])];
const size = file => gzipSync(readFileSync(`${dist}/${file}`), {level: 9}).length;
const sum = files => files.reduce((total, file) => total + size(file), 0);
const initialJs = sum([...initial].filter(file => file.endsWith('.js')));
const rows = [
  {asset: 'Initial JavaScript', bytes: initialJs},
  {asset: 'All JavaScript (includes mock and lazy features)', bytes: sum(assets.filter(file => file.endsWith('.js')))},
  {asset: 'CSS', bytes: sum(assets.filter(file => file.endsWith('.css')))},
  ...assets.filter(file => /(?:LiteCodeEditor|ShareDialog)-.*\.js$/.test(file)).map(file => ({asset: file, bytes: size(file)}))
];
console.table(rows);
console.log('Gzip level 9, bytes. Initial size follows manifest static imports; no mock or dynamic features.');
if (initialJs > 325270 + 5000) throw new Error('Initial JS exceeds its budget of 330270 bytes');
if (assets.some(file => /ShareDialog-.*\.js$/.test(file) && size(file) >= 10000)) throw new Error('Sharing chunk exceeds the QR budget');
