/** Usage: node tools/fetch-honk.mjs <out-dir> [--repo owner/name] [--tag tag] [--api url]; Node 22+; exits 0/1/2 for done/verification failure/usage.
 * Downloads every honk-core build from honk's rolling debug pre-release, checks each file against the sha256 digest the GitHub API reports, and
 * writes HONK-SOURCE.txt with the commit the binaries were built from. GITHUB_TOKEN or GH_TOKEN, when set, authenticates the API call.
 * Temporary: the release workflow bundles these builds until honk publishes a release with the native API. */
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

export const SOURCE_NOTE = 'HONK-SOURCE.txt';
// honk's Cargo.toml declares the licence; LICENSE carries the GPL-3.0 text.
const LICENCE = 'GPL-3.0-only';
const usage = 'Usage: node tools/fetch-honk.mjs <out-dir> [--repo owner/name] [--tag tag] [--api url]';

// honk's release workflow builds each target twice: mimalloc by default, and the system allocator under -stock.
export function expectedAssets() {
  const names = [];
  for (const arch of ['x86_64', 'aarch64'])
    for (const libc of ['gnu', 'musl']) for (const allocator of ['', '-stock']) names.push(`honk-core-debug-${arch}-unknown-linux-${libc}${allocator}.tar.gz`);
  return names;
}

// The debug workflow writes the source tag, commit and run into the release body.
export function parseBody(body) {
  const field = pattern => (body ?? '').match(pattern)?.[1];
  const source = {tag: field(/^Source tag: `([^`\s]+)`\s*$/m), commit: field(/^Commit: `([0-9a-f]{40})`\s*$/m), build: field(/^Build: (https:\/\/\S+)\s*$/m)};
  const missing = Object.entries(source)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`release body lacks ${missing.join(', ')}`);
  return source;
}

export function sourceNote({repo, release, source, files}) {
  const tree = `https://github.com/${repo}/tree/${source.commit}`;
  return [
    'honk-core builds bundled with this doona release',
    '',
    'doona ships these until honk publishes a release with the native API. They are',
    `unmodified copies of the ${release.tag_name} pre-release assets.`,
    '',
    `Release: ${release.html_url}`,
    `Source tag: ${source.tag}`,
    `Commit: ${source.commit}`,
    `Build: ${source.build}`,
    `Licence: ${LICENCE}, https://github.com/${repo}/blob/${source.commit}/LICENSE`,
    `Corresponding source: ${tree}`,
    `Source archive: https://github.com/${repo}/archive/${source.commit}.tar.gz`,
    '',
    'SHA-256:',
    ...files.map(({name, sha256}) => `${sha256}  ${name}`),
    ''
  ].join('\n');
}

async function download(url, path) {
  const response = await fetch(url, {redirect: 'follow', signal: AbortSignal.timeout(300_000)});
  if (!response.ok || !response.body) throw new Error(`GET ${url}: HTTP ${response.status}`);
  const hash = createHash('sha256');
  const tap = new Transform({
    transform(chunk, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), tap, createWriteStream(path));
  return hash.digest('hex');
}

export async function fetchHonk({out, repo = 'Glassyiris/honk', tag = 'debug', api = 'https://api.github.com', token, log = () => {}}) {
  const headers = {accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${api}/repos/${repo}/releases/tags/${tag}`, {headers, signal: AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`GET release ${repo}@${tag}: HTTP ${response.status}`);
  const release = await response.json();
  const source = parseBody(release.body);
  if (/^[0-9a-f]{40}$/.test(release.target_commitish ?? '') && release.target_commitish !== source.commit)
    throw new Error(`release body names commit ${source.commit}, the release targets ${release.target_commitish}`);

  const expected = expectedAssets();
  const assets = new Map((release.assets ?? []).filter(asset => asset.name.startsWith('honk-core-')).map(asset => [asset.name, asset]));
  const missing = expected.filter(name => !assets.has(name));
  const unexpected = [...assets.keys()].filter(name => !expected.includes(name));
  if (missing.length) throw new Error(`release lacks ${missing.join(', ')}`);
  // A new variant changes what doona ships, so it needs a look before it goes out.
  if (unexpected.length) throw new Error(`release has unrecognised builds ${unexpected.join(', ')}`);

  await mkdir(out, {recursive: true});
  const files = [];
  for (const name of expected) {
    const asset = assets.get(name);
    const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1];
    if (!digest) throw new Error(`${name}: the API reports no sha256 digest`);
    const partial = join(out, `${name}.part`);
    try {
      const actual = await download(asset.browser_download_url, partial);
      if (actual !== digest) throw new Error(`${name}: sha256 ${actual}, the API reports ${digest}`);
      await rename(partial, join(out, name));
    } finally {
      await rm(partial, {force: true});
    }
    files.push({name, sha256: digest});
    log(`OK ${digest}  ${name}`);
  }
  await writeFile(join(out, SOURCE_NOTE), sourceNote({repo, release, source, files}));
  log(`${source.tag} at ${source.commit}`);
  return {source, files};
}

export async function main(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) {
      positional.push(args[i]);
      continue;
    }
    if (!['--repo', '--tag', '--api'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
      console.error(usage);
      return 2;
    }
    options[args[i].slice(2)] = args[++i];
  }
  if (positional.length !== 1) {
    console.error(usage);
    return 2;
  }
  try {
    await fetchHonk({...options, out: positional[0], token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN, log: line => console.log(line)});
    return 0;
  } catch (error) {
    console.error(`fetch-honk: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
