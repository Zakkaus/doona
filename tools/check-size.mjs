import {readdir, readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

const {sizeBudget} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const dist = new URL('../dist/', import.meta.url);
const assets = new URL('assets/', dist);
const files = (await readdir(assets)).sort();
const sizes = new Map();

function check(kind, bytes) {
  const budget = sizeBudget?.[kind];
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error(`Invalid sizeBudget.${kind}`);
  console.log(`${kind}: ${bytes} bytes gzip / ${budget} bytes budget`);
  if (bytes > budget) process.exitCode = 1;
}

for (const kind of ['js', 'css']) {
  const chunks = files.filter(file => file.endsWith(`.${kind}`));
  if (!chunks.length) throw new Error(`No ${kind} assets; run pnpm build first.`);
  let bytes = 0;
  let language = 0;
  for (const file of chunks) {
    const size = gzipSync(await readFile(new URL(file, assets))).length;
    sizes.set(`assets/${file}`, size);
    // A reader loads one language catalogue, so only the largest counts towards the total.
    if (file.startsWith('locale-')) language = Math.max(language, size);
    else bytes += size;
    console.log(`  assets/${file}: ${size} bytes gzip`);
  }
  bytes += language;
  console.log(`${kind} chunks: ${chunks.length}`);
  check(kind, bytes);
}

const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const entries = Object.keys(manifest).filter(key => manifest[key].isEntry);
if (!entries.length) throw new Error('No entry chunks in Vite manifest.');
const visited = new Set();
const shell = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
  if (chunk.file.endsWith('.js')) {
    if (!sizes.has(chunk.file)) throw new Error(`Missing JS asset: ${chunk.file}`);
    shell.add(chunk.file);
  }
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
for (const key of entries) visit(key);
console.log(`entry: ${entries.reduce((sum, key) => sum + sizes.get(manifest[key].file), 0)} bytes gzip`);
console.log('shell (entry and static imports):');
let shellBytes = 0;
for (const file of [...shell].sort()) {
  const size = sizes.get(file);
  shellBytes += size;
  console.log(`  ${file}: ${size} bytes gzip`);
}
// Startup loads one language catalogue before the first render, so the largest counts towards the shell.
const locale = Math.max(0, ...[...sizes].filter(([file]) => file.startsWith('assets/locale-')).map(([, size]) => size));
console.log(`  largest locale catalogue: ${locale} bytes gzip`);
check('shell', shellBytes + locale);
