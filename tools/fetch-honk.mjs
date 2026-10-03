/** Usage: node tools/fetch-honk.mjs <out-dir> [--repo owner/name] [--tag tag] [--api url] [--archive url] [--commit sha]; Node 22+; exits 0/1/2
 * for done/verification failure/usage. Downloads every honk-core build from the pinned debug pre-release, checks each file against the sha256
 * digest the GitHub API reports, checks that the release body, the release target and the source tag all name the pinned tag and commit,
 * downloads the source archive of that commit, and writes HONK-SOURCE.txt naming it. The pin is --tag and --commit or, by default, tools/honk-pin.txt.
 * GITHUB_TOKEN or GH_TOKEN, when set, authenticates the API calls.
 * Temporary: the release workflow bundles these builds until honk publishes a release with the native API. */
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const SOURCE_NOTE = 'HONK-SOURCE.txt';
// honk's Cargo.toml declares the licence; LICENSE carries the GPL-3.0 text.
const LICENCE = 'GPL-3.0-only';
const usage = 'Usage: node tools/fetch-honk.mjs <out-dir> [--repo owner/name] [--tag tag] [--api url] [--archive url] [--commit sha]';
const SHA = /^[0-9a-f]{40}$/;

// A doona release names the honk debug tag it bundles and that tag's full commit SHA here; the release PR bumps both.
export const PIN_FILE = fileURLToPath(new URL('honk-pin.txt', import.meta.url));

export async function readPin(path = PIN_FILE) {
  const [tag, commit, ...rest] = (await readFile(path, 'utf8')).trim().split('\n');
  if (!tag?.startsWith('debug.') || /\s/.test(tag) || commit === undefined || rest.length)
    throw new Error(`${path} must hold a debug.* tag and a commit SHA, one per line`);
  if (!SHA.test(commit)) throw new Error(`${path} holds no full commit SHA`);
  return {tag, commit};
}

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

// GPL-3.0 section 6: the release carries the corresponding source beside the binaries rather than only pointing at it.
export const sourceArchive = commit => `honk-source-${commit}.tar.gz`;

export function sourceNote({repo, release, source, files}) {
  const tree = `https://github.com/${repo}/tree/${source.commit}`;
  return [
    'honk-core builds bundled with this doona release',
    '',
    'doona ships these until honk publishes a release with the native API. They are',
    `unmodified copies of the ${release.tag_name} pre-release assets, checked against the`,
    'honk commit this doona release pins.',
    '',
    `Release: ${release.html_url}`,
    `Source tag: ${source.tag}`,
    `Commit: ${source.commit}`,
    `Build: ${source.build}`,
    `Licence: ${LICENCE}, https://github.com/${repo}/blob/${source.commit}/LICENSE`,
    `Corresponding source: ${tree}`,
    `Source archive: ${sourceArchive(source.commit)}, from https://github.com/${repo}/archive/${source.commit}.tar.gz`,
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

// The commit a tag points to, through an annotated tag's object when there is one.
async function tagCommit({api, repo, tag, headers}) {
  const read = async path => {
    const response = await fetch(`${api}/repos/${repo}/git/${path}`, {headers, signal: AbortSignal.timeout(60_000)});
    if (!response.ok) throw new Error(`GET source tag ${repo}@${tag}: HTTP ${response.status}`);
    return (await response.json()).object;
  };
  let object = await read(`ref/tags/${encodeURIComponent(tag)}`);
  if (object?.type === 'tag') object = await read(`tags/${object.sha}`);
  if (object?.type !== 'commit') throw new Error(`source tag ${tag} does not point to a commit`);
  return object.sha;
}

export async function fetchHonk({
  out,
  repo = 'Glassyiris/honk',
  tag,
  api = 'https://api.github.com',
  archive = 'https://github.com',
  commit,
  token,
  log = () => {}
}) {
  if (!tag?.startsWith('debug.')) throw new Error(`the pinned tag ${tag} is not a debug.* tag`);
  if (!SHA.test(commit ?? '')) throw new Error(`the pinned commit ${commit} is not a full commit SHA`);
  const headers = {accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${api}/repos/${repo}/releases/tags/${tag}`, {headers, signal: AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`GET release ${repo}@${tag}: HTTP ${response.status}`);
  const release = await response.json();
  const source = parseBody(release.body);
  if (source.tag !== tag) throw new Error(`release body names source tag ${source.tag}, doona pins ${tag}`);
  if (source.commit !== commit) throw new Error(`release body names commit ${source.commit}, doona pins ${commit}`);
  // The source shipped must be the commit the builds came from. A release that targets a branch names no commit, and the
  // source tag the build ran on is checked either way.
  if (SHA.test(release.target_commitish ?? '') && release.target_commitish !== commit)
    throw new Error(`the release targets ${release.target_commitish}, doona pins ${commit}`);
  const tagged = await tagCommit({api, repo, tag: source.tag, headers});
  if (tagged !== commit) throw new Error(`source tag ${source.tag} points to ${tagged}, doona pins ${commit}`);

  const expected = expectedAssets();
  const assets = new Map((release.assets ?? []).filter(asset => asset.name.startsWith('honk-core-')).map(asset => [asset.name, asset]));
  const missing = expected.filter(name => !assets.has(name));
  const unexpected = [...assets.keys()].filter(name => !expected.includes(name));
  if (missing.length) throw new Error(`release lacks ${missing.join(', ')}`);
  // A new variant changes what doona ships, so it needs a look before it goes out.
  if (unexpected.length) throw new Error(`release has unrecognised builds ${unexpected.join(', ')}`);

  await mkdir(out, {recursive: true});
  // Only a complete file gets its final name; `expect` is the digest to check it against, when one is published.
  const save = async (url, name, expect) => {
    const partial = join(out, `${name}.part`);
    try {
      const actual = await download(url, partial);
      if (expect && actual !== expect) throw new Error(`${name}: sha256 ${actual}, the API reports ${expect}`);
      await rename(partial, join(out, name));
      return actual;
    } finally {
      await rm(partial, {force: true});
    }
  };
  const files = [];
  for (const name of expected) {
    const asset = assets.get(name);
    const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1];
    if (!digest) throw new Error(`${name}: the API reports no sha256 digest`);
    await save(asset.browser_download_url, name, digest);
    files.push({name, sha256: digest});
    log(`OK ${digest}  ${name}`);
  }
  // GitHub publishes no digest for a commit archive, so the copy downloaded here is the one SHA256SUMS vouches for.
  const name = sourceArchive(source.commit);
  files.push({name, sha256: await save(`${archive}/${repo}/archive/${source.commit}.tar.gz`, name)});
  log(`OK ${files.at(-1).sha256}  ${name}`);
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
    if (!['--repo', '--tag', '--api', '--archive', '--commit'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
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
    const pin = options.tag && options.commit ? {} : await readPin();
    await fetchHonk({...pin, ...options, out: positional[0], token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN, log: line => console.log(line)});
    return 0;
  } catch (error) {
    console.error(`fetch-honk: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
