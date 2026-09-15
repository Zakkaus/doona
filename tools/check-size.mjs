import {readdir, readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

const {sizeBudget} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const assets = new URL('../dist/assets/', import.meta.url);
const files = await readdir(assets);

for (const kind of ['js', 'css']) {
  const budget = sizeBudget?.[kind];
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error(`Invalid sizeBudget.${kind}`);
  const chunks = files.filter(file => file.endsWith(`.${kind}`));
  if (!chunks.length) throw new Error(`No ${kind} assets; run pnpm build first.`);
  let bytes = 0;
  for (const file of chunks) bytes += gzipSync(await readFile(new URL(file, assets))).length;
  console.log(`${kind}: ${bytes} bytes gzip / ${budget} bytes budget`);
  if (bytes > budget) process.exitCode = 1;
}
