import {readdir, readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {checkLimits, evaluate, measure, report, totals} from './size-budget.mjs';

const {sizeBudget} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
checkLimits(sizeBudget);
const dist = new URL('../dist/', import.meta.url);
const sizes = new Map();
const files = (await readdir(new URL('assets/', dist))).filter(file => /\.(js|css)$/.test(file));
if (!files.some(file => file.endsWith('.js'))) throw new Error('No JS assets; run pnpm build first.');
for (const file of files) sizes.set(`assets/${file}`, gzipSync(await readFile(new URL(`assets/${file}`, dist))).length);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const size = file => {
  if (!sizes.has(file)) throw new Error(`Missing built asset: ${file}`);
  return sizes.get(file);
};

const results = evaluate(measure(manifest, size), sizeBudget);
for (const result of results) console.log(report(result));
const total = totals(sizes);
console.log(`total (information only): js ${total.js} bytes gzip, css ${total.css} bytes gzip, ${sizes.size} files`);
if (results.some(({ok}) => !ok)) process.exitCode = 1;
